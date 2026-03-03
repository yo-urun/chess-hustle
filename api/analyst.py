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

class TacticsDetector:
    def __init__(self, board: chess.Board):
        self.board = board

    def get_tactics(self, move: chess.Move) -> List[str]:
        tactics = []
        try:
            if self.board.gives_check(move):
                self.board.push(move)
                if len(self.board.checkers()) > 1: tactics.append("double_check")
                else: tactics.append("check")
                self.board.pop()

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
                if valuable_targets >= 2: tactics.append("fork")
            self.board.pop()
            
            if self.board.is_capture(move): tactics.append("capture")
        except: pass
        return list(set(tactics))

def analyze_game(pgn_text: str, username: str) -> Dict[str, Any]:
    # Extract ID first to ensure we return it even on error
    game_id = "unknown"
    try:
        pgn = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn)
        if game:
            game_id = game.headers.get("LichessId", game.headers.get("Site", "").split("/")[-1])
        
        if not game: return {"game_id": game_id, "error": "Invalid PGN"}

        headers = game.headers
        is_white = headers.get("White", "").lower() == username.lower()
        board = game.board()
        moves = list(game.mainline_moves())
        
        analysis_map = {}
        detector = TacticsDetector(board)
        prev_eval = 0.0
        prev_material = get_material_value(board)

        for i, move in enumerate(moves):
            move_num = i + 1
            player_turn = (i % 2 == 0)
            is_player_move = (player_turn == is_white)
            
            fen_before = board.fen()
            cloud_data = fetch_cloud_eval(fen_before)
            
            curr_eval = prev_eval
            best_move_uci = None
            if cloud_data:
                pvs = cloud_data.get("pvs", [{}])[0]
                best_move_uci = pvs.get("moves", "").split(" ")[0]
                cp = pvs.get("cp")
                mate = pvs.get("mate")
                if cp is not None: curr_eval = cp / 100.0
                elif mate: curr_eval = 20.0 if mate > 0 else -20.0

            move_san = board.san(move)
            played_tactics = detector.get_tactics(move)
            
            current_material = get_material_value(board)
            material_delta = current_material - prev_material
            player_material_delta = material_delta if player_turn else -material_delta
            eval_delta = (curr_eval - prev_eval) if player_turn else -(curr_eval - prev_eval)

            if player_material_delta < -100 and eval_delta > -0.5:
                played_tactics.append("sacrifice")

            board.push(move)
            
            annotation = {
                "move_number": move_num,
                "san": move_san,
                "eval": curr_eval,
                "tactics": played_tactics,
                "best_move": best_move_uci
            }

            if is_player_move:
                if eval_delta < -1.5: annotation["severity"] = "blunder"
                elif eval_delta < -0.8: annotation["severity"] = "mistake"

            if played_tactics or annotation.get("severity"):
                analysis_map[f"move_{move_num}"] = annotation

            prev_eval = curr_eval
            prev_material = current_material

        return {
            "game_id": game_id,
            "player_color": "white" if is_white else "black",
            "analysis_map": analysis_map,
            "statistics": {
                "blunders": len([m for m in analysis_map.values() if m.get("severity") == "blunder"]),
                "brilliant_moves": len([m for m in analysis_map.values() if "sacrifice" in m.get("tactics", [])])
            },
            "game_info": {
                "white": headers.get("White"),
                "black": headers.get("Black"),
                "result": headers.get("Result"),
                "site": headers.get("Site")
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
            games = data.get("games", [])
            username = data.get("username", "")
            all_results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, g["pgn"], username) for g in games]
                for f in futures:
                    all_results.append(f.result())
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "analyses": all_results}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
