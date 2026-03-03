import chess
import chess.pgn
import json
import requests
import io
from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Any, Optional
from functools import lru_cache
from chess_tactic_classifier import Classifier

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

# --- Core Analysis Engine ---

def analyze_game(pgn_text: str, username: str, existing_evals: List[Dict] = None, manual_id: str = None) -> Dict[str, Any]:
    try:
        pgn = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn)
        
        game_id = manual_id or (game.headers.get("LichessId") if game else "unknown")
        if not game: return {"game_id": game_id, "error": "Invalid PGN"}

        headers = game.headers
        white_name = headers.get("White", "Unknown")
        black_name = headers.get("Black", "Unknown")
        is_white = white_name.lower() == username.lower()
        
        board = game.board()
        moves = list(game.mainline_moves())
        
        analysis_map = {}
        classifier = Classifier() # Initialize professional classifier
        
        prev_eval = 0.0
        prev_material = get_material_value(board)

        evals_data = {}
        if existing_evals:
            for e in existing_evals:
                if "move" in e: evals_data[int(e["move"])] = e

        for i, move in enumerate(moves):
            move_num = i + 1
            player_turn = (i % 2 == 0)
            is_player_move = (player_turn == is_white)
            
            fen_before = board.fen()
            
            curr_eval = None
            best_move_uci = None
            best_move_tactics = []
            
            # Fetch Eval and Best Move
            if move_num in evals_data:
                e = evals_data[move_num]
                curr_eval = e.get("eval")
                if curr_eval is not None and abs(curr_eval) > 50:
                    curr_eval = curr_eval / 100.0
                best_move_uci = e.get("bestMove")
            
            if curr_eval is None:
                cloud_data = fetch_cloud_eval(fen_before)
                if cloud_data:
                    pvs = cloud_data.get("pvs", [{}])[0]
                    best_move_uci = pvs.get("moves", "").split(" ")[0]
                    cp = pvs.get("cp")
                    mate = pvs.get("mate")
                    if cp is not None: curr_eval = cp / 100.0
                    elif mate: curr_eval = 20.0 if mate > 0 else -20.0

            if curr_eval is None: curr_eval = prev_eval

            # Tactic Classification for Played Move
            move_san = board.san(move)
            # Use Classifier to get tactical themes
            try:
                played_tactics = classifier.classify(fen_before, move.uci())
                if not isinstance(played_tactics, list):
                    played_tactics = []
            except:
                played_tactics = []
            
            # Tactic Classification for Best Move (to find missed opportunities)
            if best_move_uci and best_move_uci != move.uci():
                try:
                    best_move_tactics = classifier.classify(fen_before, best_move_uci)
                    if not isinstance(best_move_tactics, list):
                        best_move_tactics = []
                except:
                    best_move_tactics = []

            # Sacrifice Detector
            current_material = get_material_value(board)
            material_delta = current_material - prev_material
            player_material_delta = material_delta if player_turn else -material_delta
            eval_delta = (curr_eval - prev_eval) if player_turn else -(curr_eval - prev_eval)

            if player_material_delta < -100 and eval_delta > -0.5:
                played_tactics.append("sacrifice")

            # Missed Tactics Logic
            missed_tactics = [t for t in best_move_tactics if t not in played_tactics]
            
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
                
                if missed_tactics:
                    annotation["missed_tactics"] = missed_tactics

            # Only add significant moments
            if played_tactics or annotation.get("severity") or annotation.get("missed_tactics"):
                analysis_map[f"move_{move_num}"] = annotation

            prev_eval = curr_eval
            prev_material = current_material

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
                "White": white_name,
                "Black": black_name,
                "Result": headers.get("Result"),
                "Site": headers.get("Site")
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
                futures = [executor.submit(analyze_game, g["pgn"], username, g.get("evals"), g.get("lichess_id")) for g in games]
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
