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

class TacticClassifier:
    def __init__(self, board: chess.Board):
        self.board = board

    def classify(self, move: chess.Move) -> List[str]:
        tactics = []
        try:
            # Check for checks
            if self.board.gives_check(move):
                self.board.push(move)
                checkers = self.board.checkers()
                if len(checkers) > 1: tactics.append("doubleCheck")
                if move.to_square not in checkers:
                    tactics.append("discoveredCheck")
                else:
                    tactics.append("check")
                self.board.pop()

            # Geometry checks
            self.board.push(move)
            sq = move.to_square
            p = self.board.piece_at(sq)
            if p:
                attacks = self.board.attacks(sq)
                targets = [self.board.piece_at(tsq) for tsq in attacks if self.board.piece_at(tsq) and self.board.piece_at(tsq).color != p.color]
                valuable = [t for t in targets if t.piece_type in [chess.ROOK, chess.QUEEN, chess.KING, chess.BISHOP, chess.KNIGHT]]
                if len(valuable) >= 2: tactics.append("fork")
                
                if p.piece_type in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
                    if self._check_linear(sq, p.color): tactics.append("linearAttack")
            
            # Trapped Piece check
            opp = not self.board.turn
            for o_sq in chess.SQUARES:
                o_p = self.board.piece_at(o_sq)
                if o_p and o_p.color == opp and o_p.piece_type in [chess.BISHOP, chess.KNIGHT, chess.QUEEN]:
                    if self.board.is_attacked_by(not opp, o_sq):
                        moves = [m for m in self.board.legal_moves if m.from_square == o_sq]
                        safe_moves = [m for m in moves if not self.board.is_attacked_by(not opp, m.to_square)]
                        if len(safe_moves) == 0:
                            tactics.append("trappedPiece")
                            break
            self.board.pop()
        except: pass
        return list(set(tactics))

    def _check_linear(self, attacker_sq: chess.Square, color: chess.Color) -> bool:
        for sq in self.board.attacks(attacker_sq):
            target = self.board.piece_at(sq)
            if target and target.color != color:
                original = self.board.remove_piece_at(sq)
                if any(self.board.piece_at(b_sq) and self.board.piece_at(b_sq).color != color for b_sq in self.board.attacks(attacker_sq)):
                    self.board.set_piece_at(sq, original)
                    return True
                self.board.set_piece_at(sq, original)
        return False

def analyze_game(pgn_text: str, username: str, existing_evals: List[Dict] = None, manual_id: str = None) -> Dict[str, Any]:
    game_id = manual_id or "unknown"
    try:
        pgn = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn)
        if not game: return {"game_id": game_id, "error": "Invalid PGN"}

        headers = game.headers
        is_white = headers.get("White", "").lower() == username.lower()
        board = game.board()
        moves = list(game.mainline_moves())
        
        analysis_map = {}
        classifier = TacticClassifier(board)
        prev_eval = 0.0
        prev_material = get_material_value(board)

        evals_data = {int(e["move"]): e for e in existing_evals if "move" in e} if existing_evals else {}

        for i, move in enumerate(moves):
            move_num = i + 1
            player_turn = (i % 2 == 0) # True = White
            is_player_move = (player_turn == is_white)
            
            curr_eval = None
            best_move_uci = None
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

            played_tactics = classifier.classify(move)
            best_move_tactics = []
            if best_move_uci and best_move_uci != move.uci():
                try: best_move_tactics = classifier.classify(chess.Move.from_uci(best_move_uci))
                except: pass

            curr_material = get_material_value(board)
            # Eval perspective adjustment: positive is White advantage
            # Move quality delta for the person who JUST MOVED
            e_delta = (curr_eval - prev_eval) if player_turn else -(curr_eval - prev_eval)
            m_delta = (curr_material - prev_material) if player_turn else -(curr_material - prev_material)

            if m_delta < -100 and e_delta > -0.5: played_tactics.append("sacrifice")
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
                # If player delta is highly negative, it's a blunder/mistake
                if e_delta < -1.5: annotation["severity"] = "blunder"
                elif e_delta < -0.8: annotation["severity"] = "mistake"
                if missed_tactics: annotation["missed_tactics"] = missed_tactics

            if played_tactics or annotation.get("severity") or annotation.get("missed_tactics"):
                analysis_map[f"move_{move_num}"] = annotation

            prev_eval, prev_material = curr_eval, curr_material

        return {
            "game_id": game_id,
            "player_color": "white" if is_white else "black",
            "analysis_map": analysis_map,
            "statistics": {
                "blunders": len([m for m in analysis_map.values() if m.get("severity") == "blunder"]),
                "missed_tactics": len([m for m in analysis_map.values() if m.get("missed_tactics")]),
                "brilliant_moves": len([m for m in analysis_map.values() if "sacrifice" in m.get("tactics", [])])
            },
            "game_info": { "White": headers.get("White"), "Black": headers.get("Black"), "Result": headers.get("Result"), "Site": headers.get("Site") }
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
            results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, g["pgn"], username, g.get("evals"), g.get("lichess_id")) for g in games]
                for f in futures: results.append(f.result())
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "analyses": results}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
