import chess
import chess.pgn
import json
from http.server import BaseHTTPRequestHandler
import os
import io
import requests
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor

# --- Constants ---
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000
}

THEME_NAMES = [
    "material", "mobility", "space", "kingSafety", 
    "positional", "tactical", "darkSquareControl", 
    "lightSquareControl", "tempo"
]

# --- Chess Logic ---

class PositionScorer:
    def __init__(self, board: chess.Board, color: chess.Color):
        self.board = board
        self.color = color
        self.enemy_color = not color

    def get_all_scores(self) -> Dict[str, float]:
        return {theme: self.get_theme_score(theme) for theme in THEME_NAMES}

    def get_theme_score(self, theme: str) -> float:
        try:
            if theme == "material": return self._score_material()
            if theme == "mobility": return self._score_mobility()
            if theme == "space": return self._score_space()
            if theme == "kingSafety": return self._score_king_safety()
            if theme == "positional": return self._score_positional()
            if theme == "tactical": return self._score_tactical()
            if theme == "darkSquareControl": return self._score_squares(False)
            if theme == "lightSquareControl": return self._score_squares(True)
            if theme == "tempo": return self._score_tempo()
        except:
            return 0.0
        return 0.0

    def _score_material(self) -> float:
        def get_side_material(c):
            score = 0
            for pt in [chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN]:
                score += len(self.board.pieces(pt, c)) * PIECE_VALUES[pt]
            if len(self.board.pieces(chess.BISHOP, c)) >= 2: score += 50
            return score
        return float(get_side_material(self.color) - get_side_material(self.enemy_color))

    def _score_mobility(self) -> float:
        def get_side_mobility(c):
            original_turn = self.board.turn
            self.board.turn = c
            mobility = len(list(self.board.legal_moves))
            self.board.turn = original_turn
            return mobility
        return float(get_side_mobility(self.color) - get_side_mobility(self.enemy_color))

    def _score_space(self) -> float:
        def get_side_space(c):
            score = 0
            opponent_half = range(4, 8) if c == chess.WHITE else range(0, 4)
            for rank in opponent_half:
                for file in range(8):
                    sq = chess.square(file, rank)
                    if self.board.is_attacked_by(c, sq):
                        score += 1
            return score
        return float(get_side_space(self.color) - get_side_space(self.enemy_color))

    def _score_king_safety(self) -> float:
        def get_side_safety(c):
            king_sq = self.board.king(c)
            if king_sq is None: return 0
            enemy_c = not c
            score = 100
            king_zone = []
            kf, kr = chess.square_file(king_sq), chess.square_rank(king_sq)
            for df in [-1, 0, 1]:
                for dr in [-1, 0, 1]:
                    nf, nr = kf + df, kr + dr
                    if 0 <= nf <= 7 and 0 <= nr <= 7:
                        king_zone.append(chess.square(nf, nr))
            for sq in king_zone:
                if self.board.is_attacked_by(enemy_c, sq):
                    score -= 15
            
            direction = 1 if c == chess.WHITE else -1
            shield_rank = kr + direction
            if 0 <= shield_rank <= 7:
                for df in [-1, 0, 1]:
                    nf = kf + df
                    if 0 <= nf <= 7:
                        sq = chess.square(nf, shield_rank)
                        p = self.board.piece_at(sq)
                        if p and p.piece_type == chess.PAWN and p.color == c:
                            score += 10
                        else:
                            score -= 10
            return score
        return float(get_side_safety(self.color) - get_side_safety(self.enemy_color))

    def _score_squares(self, light_sq: bool) -> float:
        def get_side_sq_control(c):
            score = 0
            for sq in chess.SQUARES:
                if chess.square_light(sq) == light_sq:
                    if self.board.is_attacked_by(c, sq):
                        score += 1
            return score
        return float(get_side_sq_control(self.color) - get_side_sq_control(self.enemy_color))

    def _score_tempo(self) -> float:
        def get_dev(c):
            score = 0
            start_rank = 0 if c == chess.WHITE else 7
            for pt in [chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN]:
                for sq in self.board.pieces(pt, c):
                    if chess.square_rank(sq) != start_rank:
                        score += 1
            return score
        return float(get_dev(self.color) - get_dev(self.enemy_color))

    def _score_positional(self) -> float:
        return 0.0

    def _score_tactical(self) -> float:
        def get_side_tac(c):
            score = 0
            if self.board.is_check():
                score += 50 if self.board.turn != c else -50
            return score
        return float(get_side_tac(self.color) - get_side_tac(self.enemy_color))

# --- Lichess Cloud Eval ---

def get_cloud_eval(fen: str) -> Optional[Dict[str, Any]]:
    try:
        response = requests.get(f"https://lichess.org/api/cloud-eval?fen={fen}", timeout=3)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return None

# --- Analysis Engine ---

def analyze_game(pgn_text: str, username: str, deep: bool = False) -> Dict[str, Any]:
    pgn = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn)
    if not game: return {"error": "Invalid PGN"}

    headers = game.headers
    white_player = headers.get("White", "")
    black_player = headers.get("Black", "")
    is_white = white_player.lower() == username.lower()
    player_color = chess.WHITE if is_white else chess.BLACK
    
    board = game.board()
    moves = list(game.mainline_moves())
    total_moves = len(moves)
    
    eval_history = []
    move_count = 0
    
    # Process mainline for evaluations
    for move in moves:
        move_count += 1
        board.push(move)
        
        # In deep mode, we sample evaluations
        is_capture = board.is_capture(move)
        is_check = board.is_check()
        
        if deep and (move_count % 5 == 0 or is_capture or is_check or move_count > total_moves - 5):
            eval_data = get_cloud_eval(board.fen())
            if eval_data:
                pvs = eval_data.get("pvs", [])
                if pvs:
                    curr_eval = pvs[0].get("cp", 0) / 100.0 if "cp" in pvs[0] else (pvs[0].get("mate", 0) * 100)
                    eval_history.append({"move": move_count, "eval": curr_eval, "fen": board.fen()})

    # Interest Score calculation
    interest_score = 0
    blunders = 0
    
    interest_score += min(total_moves / 10, 5) # Longer games might be more interesting
    
    if len(eval_history) > 2:
        prev_eval = eval_history[0]["eval"]
        for e in eval_history[1:]:
            diff = abs(e["eval"] - prev_eval)
            if diff > 2.0:
                interest_score += 3
                blunders += 1
            prev_eval = e["eval"]

    result = headers.get("Result", "*")
    if result == "1/2-1/2": interest_score += 2
    elif (result == "1-0" and not is_white) or (result == "0-1" and is_white):
        interest_score += 4 # Losses are instructive

    opening = headers.get("Opening", "Unknown")
    if opening != "Unknown": interest_score += 1

    return {
        "game_id": headers.get("LichessId", headers.get("Site", "").split("/")[-1]),
        "pgn": pgn_text,
        "game_info": {
            "white": white_player,
            "black": black_player,
            "result": result,
            "date": headers.get("Date"),
            "opening": opening,
            "url": headers.get("Site")
        },
        "summary": {
            "interest_score": interest_score,
            "blunders": blunders,
            "total_moves": total_moves,
            "is_white": is_white
        },
        "eval_history": eval_history,
        "analysis_type": "deep" if deep else "surface"
    }

# --- Vercel Handler ---

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            pgn_list = data.get("pgns", [])
            username = data.get("username", "")
            deep = data.get("deep", False)
            
            pgn_list = pgn_list[:10]
            
            print(f"[Analyst] Processing {len(pgn_list)} games for {username} (parallel, deep={deep})")
            
            all_analyses = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, pgn, username, deep) for pgn in pgn_list]
                for future in futures:
                    all_analyses.append(future.result())
            
            all_analyses.sort(key=lambda x: x.get("summary", {}).get("interest_score", 0), reverse=True)
            
            response_data = {
                "status": "success",
                "analyses": all_analyses,
                "count": len(all_analyses)
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            print(f"[Analyst] Error: {str(e)}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
