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

# --- Professional Tactic Classifier (Custom Implementation) ---
class TacticClassifier:
    def __init__(self, board: chess.Board):
        self.board = board

    def classify(self, move: chess.Move) -> List[str]:
        tactics = []
        
        # 1. Checks & Double Checks
        if self.board.gives_check(move):
            self.board.push(move)
            if len(self.board.checkers()) > 1: tactics.append("doubleCheck")
            else: tactics.append("check")
            self.board.pop()

        # 2. Capture and Hanging Pieces
        if self.board.is_capture(move):
            tactics.append("capture")
            # If target was undefended -> Hanging Piece
            if not self.board.is_attacked_by(not self.board.turn, move.to_square):
                tactics.append("hangingPiece")

        # 3. Discovered Attack logic
        attacks_before = self.board.occupied_co[self.board.turn]
        self.board.push(move)
        # Check if any piece (other than moved) now attacks something vital
        # Simplified: did the number of checkers change for the opponent?
        if self.board.is_check():
            # If more than 1 piece is attacking the king, but only 1 moved...
            pass 
        self.board.pop()

        # 4. Fork Detector
        self.board.push(move)
        moved_piece_sq = move.to_square
        moved_piece = self.board.piece_at(moved_piece_sq)
        if moved_piece:
            attacks = self.board.attacks(moved_piece_sq)
            targets = 0
            for sq in attacks:
                target = self.board.piece_at(sq)
                if target and target.color != moved_piece.color:
                    if target.piece_type in [chess.ROOK, chess.QUEEN, chess.KING, chess.BISHOP, chess.KNIGHT]:
                        targets += 1
            if targets >= 2: tactics.append("fork")
            
            # Pin / Skewer (Linear)
            if moved_piece.piece_type in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
                if self.detect_linear_tactic(moved_piece_sq):
                    tactics.append("linearAttack") # Pin or Skewer
        self.board.pop()

        return list(set(tactics))

    def detect_linear_tactic(self, attacker_sq: chess.Square) -> bool:
        attacker = self.board.piece_at(attacker_sq)
        if not attacker: return False
        
        for sq in self.board.attacks(attacker_sq):
            target = self.board.piece_at(sq)
            if target and target.color != attacker.color:
                # Ghost-remove the target to see what's behind
                original = self.board.remove_piece_at(sq)
                behind_attacks = self.board.attacks(attacker_sq)
                for b_sq in behind_attacks:
                    behind_p = self.board.piece_at(b_sq)
                    if behind_p and behind_p.color != attacker.color:
                        self.board.set_piece_at(sq, original)
                        return True
                self.board.set_piece_at(sq, original)
        return False

# --- Core Analysis Engine ---

def analyze_game(pgn_text: str, username: str, existing_evals: List[Dict] = None, manual_id: str = None) -> Dict[str, Any]:
    game_id = manual_id or "unknown"
    try:
        pgn = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn)
        if not game: return {"game_id": game_id, "error": "Invalid PGN"}

        headers = game.headers
        white_name = headers.get("White", "Unknown")
        black_name = headers.get("Black", "Unknown")
        is_white = white_name.lower() == username.lower()
        
        board = game.board()
        moves = list(game.mainline_moves())
        
        analysis_map = {}
        classifier = TacticClassifier(board)
        
        prev_eval = 0.0
        prev_material = get_material_value(board)

        # Mapping browser evals
        evals_data = {}
        if existing_evals:
            for e in existing_evals:
                if "move" in e: evals_data[int(e["move"])] = e

        for i, move in enumerate(moves):
            move_num = i + 1
            player_turn = (i % 2 == 0)
            is_player_move = (player_turn == is_white)
            
            curr_eval = None
            best_move_uci = None
            best_move_tactics = []
            
            # 1. Get Eval & Best Move (WASM or Cloud)
            if move_num in evals_data:
                e = evals_data[move_num]
                curr_eval = e.get("eval")
                if curr_eval is not None and abs(curr_eval) > 50: curr_eval /= 100.0
                best_move_uci = e.get("bestMove")
            
            if curr_eval is None:
                cloud = fetch_cloud_eval(board.fen())
                if cloud:
                    pv = cloud.get("pvs", [{}])[0]
                    best_move_uci = pv.get("moves", "").split(" ")[0]
                    cp, mate = pv.get("cp"), pv.get("mate")
                    if cp is not None: curr_eval = cp / 100.0
                    elif mate: curr_eval = 20.0 if mate > 0 else -20.0

            if curr_eval is None: curr_eval = prev_eval

            # 2. Classify Played Move
            played_tactics = classifier.classify(move)
            
            # 3. Classify Best Move (Missed Tactics)
            if best_move_uci and best_move_uci != move.uci():
                try:
                    bm_obj = chess.Move.from_uci(best_move_uci)
                    best_move_tactics = classifier.classify(bm_obj)
                except: pass

            # Sacrifice Detector
            curr_material = get_material_value(board)
            mat_delta = curr_material - prev_material
            p_mat_delta = mat_delta if player_turn else -mat_delta
            e_delta = (curr_eval - prev_eval) if player_turn else -(curr_eval - prev_eval)

            if p_mat_delta < -100 and e_delta > -0.5:
                played_tactics.append("sacrifice")

            missed_tactics = [t for t in best_move_tactics if t not in played_tactics]
            move_san = board.san(move)
            
            board.push(move)
            
            annotation = {
                "move_number": move_num,
                "san": move_san,
                "eval": curr_eval,
                "tactics": played_tactics,
                "best_move": best_move_uci
            }

            if is_player_move:
                if e_delta < -1.5: annotation["severity"] = "blunder"
                elif e_delta < -0.8: annotation["severity"] = "mistake"
                if missed_tactics: annotation["missed_tactics"] = missed_tactics

            if played_tactics or annotation.get("severity") or annotation.get("missed_tactics"):
                analysis_map[f"move_{move_num}"] = annotation

            prev_eval = curr_eval
            prev_material = curr_material

        return {
            "game_id": game_id,
            "player_color": "white" if is_white else "black",
            "analysis_map": analysis_map,
            "statistics": {
                "blunders": len([m for m in analysis_map.values() if m.get("severity") == "blunder"]),
                "missed_tactics": len([m for m in analysis_map.values() if m.get("missed_tactics")]),
                "brilliant_moves": len([m for m in analysis_map.values() if "sacrifice" in m.get("tactics", [])])
            },
            "game_info": {
                "White": white_name, "Black": black_name,
                "Result": headers.get("Result"), "Site": headers.get("Site")
            }
        }
    except Exception as e:
        return {"game_id": game_id, "error": str(e)}

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        try:
            data = json.loads(post_data)
            games, username = data.get("games", []), data.get("username", "")
            all_results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, g["pgn"], username, g.get("evals"), g.get("lichess_id")) for g in games]
                for f in futures: all_results.append(f.result())
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "analyses": all_results}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
