import chess
import chess.pgn
import json
import requests
import io
from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Any, Optional
from functools import lru_cache

# --- Configuration ---
LICHESS_CLOUD_EVAL_URL = "https://lichess.org/api/cloud-eval"

@lru_cache(max_size=1024)
def fetch_cloud_eval(fen: str) -> Optional[Dict]:
    try:
        resp = requests.get(f"{LICHESS_CLOUD_EVAL_URL}?fen={fen}&multiPv=1", timeout=2)
        if resp.status_code == 200:
            return resp.json()
    except:
        return None
    return None

# --- Advanced Tactics Detector ---
class TacticsDetector:
    def __init__(self, board: chess.Board):
        self.board = board

    def get_themes(self, move: chess.Move) -> List[str]:
        themes = []
        
        # 1. Double Check
        if self.board.gives_check(move):
            self.board.push(move)
            if len(self.board.checkers()) > 1:
                themes.append("double_check")
            else:
                themes.append("check")
            self.board.pop()

        # 2. Discovered Attack
        # Get attacks from all pieces except the one moving
        moved_piece_type = self.board.piece_at(move.from_square).piece_type
        attacks_before = {}
        for sq in chess.SQUARES:
            p = self.board.piece_at(sq)
            if p and p.color == self.board.turn and sq != move.from_square:
                attacks_before[sq] = self.board.attacks(sq)
        
        self.board.push(move)
        for sq, before in attacks_before.items():
            after = self.board.attacks(sq)
            # If new squares are attacked that weren't before (discovered)
            new_attacks = after & ~before
            for target_sq in new_attacks:
                target_piece = self.board.piece_at(target_sq)
                if target_piece and target_piece.color == self.board.turn: # Opponent color now
                    themes.append("discovered_attack")
                    break
        self.board.pop()

        # 3. Fork, Pin, Skewer
        # We simulate the move and check the state
        self.board.push(move)
        moved_piece_sq = move.to_square
        moved_piece = self.board.piece_at(moved_piece_sq)
        
        if moved_piece:
            attacks = self.board.attacks(moved_piece_sq)
            valuable_targets = []
            for sq in attacks:
                target = self.board.piece_at(sq)
                if target and target.color != moved_piece.color:
                    if target.piece_type in [chess.ROOK, chess.QUEEN, chess.KING, chess.BISHOP, chess.KNIGHT]:
                        valuable_targets.append(target.piece_type)
            
            # Fork logic
            if len(valuable_targets) >= 2:
                themes.append("fork")

            # Pin / Skewer Logic (Linear attacks)
            if moved_piece.piece_type in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
                # Check for pins/skewers created by this piece
                opponent_color = not moved_piece.color
                for sq in chess.SQUARES:
                    p = self.board.piece_at(sq)
                    if p and p.color == opponent_color:
                        # is_pinned in chess lib checks if piece protects king
                        # We need a more general 'relative pin' or skewer
                        # Logic: if we remove piece P, do we attack something behind it?
                        if self.is_linear_attack(moved_piece_sq, sq):
                            themes.append("linear_attack") # Internal tag for pin/skewer

        self.board.pop()
        return list(set(themes))

    def is_linear_attack(self, attacker_sq: chess.Square, target_sq: chess.Square) -> bool:
        # Check if target_sq is between attacker and another piece
        attacker = self.board.piece_at(attacker_sq)
        if not attacker: return False
        
        # Simplified: if we remove the piece at target_sq, does the attacker attack something else?
        piece_at_target = self.board.remove_piece_at(target_sq)
        is_linear = False
        new_attacks = self.board.attacks(attacker_sq)
        for sq in new_attacks:
            behind_piece = self.board.piece_at(sq)
            if behind_piece and behind_piece.color != attacker.color:
                # If target was more valuable than piece behind -> Skewer
                # If target was less valuable -> Pin
                is_linear = True
                break
        self.board.set_piece_at(target_sq, piece_at_target)
        return is_linear

# --- Core Analysis Engine ---

def analyze_game(pgn_text: str, username: str, existing_evals: List[Dict] = None) -> Dict[str, Any]:
    pgn = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn)
    if not game: return {"error": "Invalid PGN"}

    headers = game.headers
    is_white = headers.get("White", "").lower() == username.lower()
    board = game.board()
    moves = list(game.mainline_moves())
    
    analysis_map = {}
    detector = TacticsDetector(board)
    prev_eval = 0.0

    for i, move in enumerate(moves):
        move_num = i + 1
        player_turn = (i % 2 == 0) # True = White
        is_player_move = (player_turn == is_white)
        
        # 1. Get Eval & Best Move for THIS position (before the move)
        fen_before = board.fen()
        cloud_data = fetch_cloud_eval(fen_before)
        
        best_move_uci = None
        best_move_themes = []
        curr_eval = prev_eval

        if cloud_data:
            pvs = cloud_data.get("pvs", [{}])[0]
            best_move_uci = pvs.get("moves", "").split(" ")[0]
            cp = pvs.get("cp")
            mate = pvs.get("mate")
            if cp is not None: curr_eval = cp / 100.0
            elif mate: curr_eval = 20.0 if mate > 0 else -20.0
            
            # Analyze what tactical themes were available (best move)
            if best_move_uci:
                try:
                    best_move_obj = chess.Move.from_uci(best_move_uci)
                    best_move_themes = detector.get_themes(best_move_obj)
                except: pass

        # 2. Analyze played move
        played_themes = detector.get_themes(move)
        
        # 3. Detect Missed Tactics
        missed_themes = [t for t in best_move_themes if t not in played_themes]
        
        board.push(move)
        move_quality_delta = (curr_eval - prev_eval) if player_turn else -(curr_eval - prev_eval)

        # Build Annotation
        annotation = {
            "move": move_num,
            "san": board.san(move),
            "eval": curr_eval,
            "themes": played_themes,
            "best_move": best_move_uci
        }

        if is_player_move:
            if move_quality_delta < -1.5: 
                annotation["severity"] = "blunder"
            if missed_themes:
                annotation["missed_tactics"] = missed_themes

        # Only add to report if there is something interesting
        if played_themes or missed_themes or annotation.get("severity"):
            analysis_map[f"move_{move_num}"] = annotation

        prev_eval = curr_eval

    return {
        "game_id": headers.get("LichessId", headers.get("Site", "").split("/")[-1]),
        "player_color": "white" if is_white else "black",
        "analysis_map": analysis_map,
        "summary": {
            "total_blunders": len([m for m in analysis_map.values() if m.get("severity") == "blunder"]),
            "total_missed_tactics": len([m for m in analysis_map.values() if m.get("missed_tactics")]),
            "tactical_accuracy": 100 # Placeholder
        }
    }

# --- Vercel Handler ---

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        try:
            data = json.loads(post_data)
            games = data.get("games", [])
            username = data.get("username", "")
            
            print(f"[Analyst] Deep Analysis for {len(games)} games")
            results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, g["pgn"], username) for g in games]
                for f in futures:
                    results.append(f.result())

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "analyses": results}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
