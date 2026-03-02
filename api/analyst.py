import chess
import chess.pgn
import json
from http.server import BaseHTTPRequestHandler
import os
import io
import requests
from typing import Dict, List, Any, Optional

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
        if theme == "material": return self._score_material()
        if theme == "mobility": return self._score_mobility()
        if theme == "space": return self._score_space()
        if theme == "kingSafety": return self._score_king_safety()
        if theme == "positional": return self._score_positional()
        if theme == "tactical": return self._score_tactical()
        if theme == "darkSquareControl": return self._score_squares(False)
        if theme == "lightSquareControl": return self._score_squares(True)
        if theme == "tempo": return self._score_tempo()
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
            mobility = 0
            for sq in chess.SQUARES:
                piece = self.board.piece_at(sq)
                if piece and piece.color == c and piece.piece_type != chess.PAWN:
                    mobility += len(self.board.attacks(sq))
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
            for df in [-1, 0, 1]:
                nf = kf + df
                if 0 <= nf <= 7:
                    is_open = True
                    for r in range(8):
                        p = self.board.piece_at(chess.square(nf, r))
                        if p and p.piece_type == chess.PAWN:
                            is_open = False
                            break
                    if is_open:
                        score -= 20
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
            king_sq = self.board.king(c)
            if (c == chess.WHITE and king_sq in [chess.G1, chess.C1]) or \
               (c == chess.BLACK and king_sq in [chess.G8, chess.C8]):
                score += 2
            return score
        return float(get_dev(self.color) - get_dev(self.enemy_color))

    def _score_positional(self) -> float:
        def get_side_pos(c):
            score = 0
            for f in range(8):
                pawns = 0
                for r in range(8):
                    p = self.board.piece_at(chess.square(f, r))
                    if p and p.piece_type == chess.PAWN and p.color == c:
                        pawns += 1
                if pawns > 1: score -= 15 * (pawns - 1)
            for f in range(8):
                rooks = 0
                has_own_pawn = False
                has_enemy_pawn = False
                for r in range(8):
                    p = self.board.piece_at(chess.square(f, r))
                    if p:
                        if p.piece_type == chess.ROOK and p.color == c:
                            rooks += 1
                        elif p.piece_type == chess.PAWN:
                            if p.color == c: has_own_pawn = True
                            else: has_enemy_pawn = True
                if rooks > 0:
                    if not has_own_pawn and not has_enemy_pawn:
                        score += 20
                    elif not has_own_pawn:
                        score += 10
            for f in range(8):
                has_pawn = False
                for r in range(8):
                    p = self.board.piece_at(chess.square(f, r))
                    if p and p.piece_type == chess.PAWN and p.color == c:
                        has_pawn = True
                        break
                if has_pawn:
                    adj_pawn = False
                    for df in [-1, 1]:
                        nf = f + df
                        if 0 <= nf <= 7:
                            for r in range(8):
                                p = self.board.piece_at(chess.square(nf, r))
                                if p and p.piece_type == chess.PAWN and p.color == c:
                                    adj_pawn = True
                                    break
                        if adj_pawn: break
                    if not adj_pawn:
                        score -= 10
            return score
        return float(get_side_pos(self.color) - get_side_pos(self.enemy_color))

    def _score_tactical(self) -> float:
        def get_side_tac(c):
            score = 0
            enemy_c = not c
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == c:
                    is_attacked = self.board.is_attacked_by(enemy_c, sq)
                    is_defended = self.board.is_attacked_by(c, sq)
                    if is_attacked and not is_defended:
                        score -= PIECE_VALUES[p.piece_type] // 5
            if self.board.is_check():
                if self.board.turn == enemy_c:
                    score += 30
                else:
                    score -= 30
            return score
        return float(get_side_tac(self.color) - get_side_tac(self.enemy_color))

# --- Lichess Cloud Eval ---

def get_cloud_eval(fen: str) -> Optional[Dict[str, Any]]:
    try:
        response = requests.get(f"https://lichess.org/api/cloud-eval?fen={fen}", timeout=2)
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
    is_white = headers.get("White", "").lower() == username.lower()
    player_color = chess.WHITE if is_white else chess.BLACK
    
    board = game.board()
    history_scores = []
    critical_moments = []
    
    scorer = PositionScorer(board, player_color)
    last_scores = scorer.get_all_scores()
    history_scores.append(last_scores)
    
    move_count = 0
    for move in game.mainline_moves():
        move_count += 1
        board.push(move)
        scorer = PositionScorer(board, player_color)
        current_scores = scorer.get_all_scores()
        
        changes = []
        for theme in THEME_NAMES:
            diff = current_scores[theme] - last_scores[theme]
            threshold = 50
            if theme == "material": threshold = 100
            if theme in ["darkSquareControl", "lightSquareControl", "space", "mobility"]: threshold = 5
            if abs(diff) >= threshold:
                changes.append({"theme": theme, "change": diff})
        
        if changes:
            moment = {
                "move_number": (move_count + 1) // 2,
                "color": "White" if board.turn == chess.BLACK else "Black",
                "move": move.uci(),
                "fen": board.fen(),
                "changes": changes
            }
            
            if deep:
                eval_data = get_cloud_eval(board.fen())
                if eval_data:
                    moment["stockfish"] = {
                        "eval": eval_data.get("pvs", [{}])[0].get("cp", 0) / 100.0,
                        "best_move": eval_data.get("pvs", [{}])[0].get("moves", "").split(" ")[0]
                    }
            
            critical_moments.append(moment)
            
        last_scores = current_scores
        history_scores.append(last_scores)

    return {
        "game_info": {
            "white": headers.get("White"),
            "black": headers.get("Black"),
            "result": headers.get("Result"),
            "date": headers.get("Date"),
            "url": headers.get("Site")
        },
        "critical_moments": critical_moments[-15:],
        "final_scores": last_scores,
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
            
            all_analyses = []
            for pgn in pgn_list:
                all_analyses.append(analyze_game(pgn, username, deep))
            
            response_data = {
                "status": "success",
                "analyses": all_analyses
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
