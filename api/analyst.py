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

@lru_cache(maxsize=1024)
def fetch_cloud_eval(fen: str) -> Optional[Dict]:
    try:
        # Requesting multiPv and wdl for better LLM context
        resp = requests.get(f"{LICHESS_CLOUD_EVAL_URL}?fen={fen}&multiPv=1", timeout=2)
        if resp.status_code == 200:
            return resp.json()
    except:
        return None
    return None

def get_material_value(board: chess.Board) -> int:
    values = {chess.PAWN: 100, chess.KNIGHT: 320, chess.BISHOP: 330, chess.ROOK: 500, chess.QUEEN: 900}
    white = sum(len(board.pieces(pt, chess.WHITE)) * val for pt, val in values.items())
    black = sum(len(board.pieces(pt, chess.BLACK)) * val for pt, val in values.items())
    return white - black

# --- Advanced Tactics Detector ---
class TacticsDetector:
    def __init__(self, board: chess.Board):
        self.board = board

    def get_tactics(self, move: chess.Move) -> List[str]:
        tactics = []
        
        # 1. Double Check
        if self.board.gives_check(move):
            self.board.push(move)
            if len(self.board.checkers()) > 1:
                tactics.append("double_check")
            else:
                tactics.append("check")
            self.board.pop()

        # 2. Discovered Attack
        attacks_before = {}
        for sq in chess.SQUARES:
            p = self.board.piece_at(sq)
            if p and p.color == self.board.turn and sq != move.from_square:
                attacks_before[sq] = self.board.attacks(sq)
        
        self.board.push(move)
        for sq, before in attacks_before.items():
            after = self.board.attacks(sq)
            new_attacks = after & ~before
            for target_sq in new_attacks:
                target_piece = self.board.piece_at(target_sq)
                if target_piece and target_piece.color == self.board.turn: # Opponent
                    tactics.append("discovered_attack")
                    break
        self.board.pop()

        # 3. Fork, Pin, Skewer
        self.board.push(move)
        moved_piece_sq = move.to_square
        moved_piece = self.board.piece_at(moved_piece_sq)
        if moved_piece:
            attacks = self.board.attacks(moved_piece_sq)
            valuable_targets = 0
            for sq in attacks:
                target = self.board.piece_at(sq)
                if target and target.color != moved_piece.color:
                    if target.piece_type in [chess.ROOK, chess.QUEEN, chess.KING, chess.BISHOP, chess.KNIGHT]:
                        valuable_targets += 1
            if valuable_targets >= 2:
                tactics.append("fork")

            # Simple Pin/Skewer via library helper
            if moved_piece.piece_type in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
                opponent_color = not moved_piece.color
                for sq in chess.SQUARES:
                    p = self.board.piece_at(sq)
                    if p and p.color == opponent_color:
                        if self.is_linear_attack(moved_piece_sq, sq):
                            tactics.append("linear_attack")
        self.board.pop()

        # 4. Remove Defender (Уничтожение защитника)
        if self.board.is_capture(move):
            target_sq = move.to_square
            # If the captured piece was defending another piece that is now attacked
            self.board.push(move)
            # This is complex to detect perfectly, but we can flag it for LLM
            tactics.append("capture_potential_defender")
            self.board.pop()

        return list(set(tactics))

    def is_linear_attack(self, attacker_sq: chess.Square, target_sq: chess.Square) -> bool:
        attacker = self.board.piece_at(attacker_sq)
        if not attacker: return False
        piece_at_target = self.board.remove_piece_at(target_sq)
        is_linear = False
        new_attacks = self.board.attacks(attacker_sq)
        for sq in new_attacks:
            behind_piece = self.board.piece_at(sq)
            if behind_piece and behind_piece.color != attacker.color:
                is_linear = True
                break
        self.board.set_piece_at(target_sq, piece_at_target)
        return is_linear

# --- Core Analysis Engine ---

def analyze_game(pgn_text: str, username: str) -> Dict[str, Any]:
    pgn = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn)
    if not game: return {"error": "Invalid PGN"}

    headers = game.headers
    white_name = headers.get("White", "Unknown")
    is_white = white_name.lower() == username.lower()
    board = game.board()
    moves = list(game.mainline_moves())
    
    analysis_map = {}
    detector = TacticsDetector(board)
    
    prev_eval = 0.0
    prev_material = get_material_value(board)

    for i, move in enumerate(moves):
        move_num = i + 1
        player_turn = (i % 2 == 0) # True = White
        is_player_move = (player_turn == is_white)
        
        fen_before = board.fen()
        cloud_data = fetch_cloud_eval(fen_before)
        
        best_move_uci = None
        best_move_tactics = []
        depth = 0
        pvs_info = ""

        if cloud_data:
            pvs = cloud_data.get("pvs", [{}])[0]
            best_move_uci = pvs.get("moves", "").split(" ")[0]
            depth = cloud_data.get("depth", 0)
            pvs_info = pvs.get("moves", "")
            cp = pvs.get("cp")
            mate = pvs.get("mate")
            if cp is not None: curr_eval = cp / 100.0
            elif mate: curr_eval = 20.0 if mate > 0 else -20.0
            else: curr_eval = prev_eval
            
            if best_move_uci:
                try:
                    best_move_obj = chess.Move.from_uci(best_move_uci)
                    best_move_tactics = detector.get_tactics(best_move_obj)
                except: pass
        else:
            curr_eval = prev_eval

        # Analyze played move
        played_tactics = detector.get_tactics(move)
        
        # Sacrifice Detector
        current_material = get_material_value(board)
        material_delta = current_material - prev_material
        # Perspective material delta for the mover
        player_material_delta = material_delta if player_turn else -material_delta
        # Perspective eval delta
        eval_delta = (curr_eval - prev_eval) if player_turn else -(curr_eval - prev_eval)

        is_sacrifice = False
        if player_material_delta < -100 and eval_delta > -0.5:
            is_sacrifice = True
            played_tactics.append("sacrifice")

        # Missed Tactics
        missed_tactics = [t for t in best_move_tactics if t not in played_tactics]
        
        board.push(move)
        
        annotation = {
            "move_number": move_num,
            "san": board.san(move),
            "eval": curr_eval,
            "tactics": played_tactics,
            "best_move": best_move_uci,
            "depth": depth,
            "pvs": pvs_info[:50] # Just a hint for LLM
        }

        if is_player_move:
            if eval_delta < -1.5: 
                annotation["severity"] = "blunder"
            elif eval_delta < -0.8:
                annotation["severity"] = "mistake"
            
            if missed_tactics:
                annotation["missed_tactics"] = missed_tactics

        # Only add significant moments
        if played_tactics or missed_tactics or annotation.get("severity"):
            analysis_map[f"move_{move_num}"] = annotation

        prev_eval = curr_eval
        prev_material = current_material

    return {
        "game_id": headers.get("LichessId", headers.get("Site", "").split("/")[-1]),
        "player_color": "white" if is_white else "black",
        "analysis_map": analysis_map,
        "statistics": {
            "blunders": len([m for m in analysis_map.values() if m.get("severity") == "blunder"]),
            "missed_tactics": len([m for m in analysis_map.values() if m.get("missed_tactics")]),
            "brilliant_moves": len([m for m in analysis_map.values() if "sacrifice" in m.get("tactics", [])])
        },
        "game_info": {
            "white": headers.get("White"),
            "black": headers.get("Black"),
            "result": headers.get("Result"),
            "site": headers.get("Site")
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
            
            all_results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, g["pgn"], username) for g in games]
                for f in futures:
                    res = f.result()
                    if "error" not in res:
                        all_results.append(res)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "analyses": all_results}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
