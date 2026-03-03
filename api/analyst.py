import chess
import chess.pgn
import json
from http.server import BaseHTTPRequestHandler
import os
import io
import requests
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor

# --- Analysis Engine ---

def analyze_game(pgn_text: str, username: str, existing_evals: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    pgn = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn)
    if not game: return {"error": "Invalid PGN"}

    headers = game.headers
    white_player = headers.get("White", "")
    black_player = headers.get("Black", "")
    is_white = white_player.lower() == username.lower()
    
    board = game.board()
    moves = list(game.mainline_moves())
    total_moves = len(moves)
    
    eval_history = []
    blunders = 0
    
    # 1. Используем существующие оценки Lichess, если они есть
    if existing_evals and len(existing_evals) > 0:
        for i, e in enumerate(existing_evals):
            curr_eval = e.get("eval", 0) / 100.0
            eval_history.append({"move": i + 1, "eval": curr_eval})
            # Простой подсчет зевков по готовым данным
            if i > 0:
                prev_eval = existing_evals[i-1].get("eval", 0) / 100.0
                diff = abs(curr_eval - prev_eval)
                if diff > 2.0: blunders += 1
    else:
        # 2. Если оценок нет, делаем выборочный Cloud Eval
        move_count = 0
        for move in moves:
            move_count += 1
            board.push(move)
            if move_count % 10 == 0 or move_count > total_moves - 5:
                try:
                    resp = requests.get(f"https://lichess.org/api/cloud-eval?fen={board.fen()}", timeout=2)
                    if resp.status_code == 200:
                        data = resp.json()
                        pvs = data.get("pvs", [])
                        if pvs:
                            curr_eval = pvs[0].get("cp", 0) / 100.0 if "cp" in pvs[0] else (pvs[0].get("mate", 0) * 100)
                            eval_history.append({"move": move_count, "eval": curr_eval})
                except: pass

    # Interest Score calculation
    interest_score = 0
    interest_score += min(total_moves / 10, 5)
    
    if len(eval_history) > 2:
        prev_e = eval_history[0]["eval"]
        for e in eval_history[1:]:
            diff = abs(e["eval"] - prev_e)
            if diff > 2.0: interest_score += 3
            prev_e = e["eval"]

    result = headers.get("Result", "*")
    if result == "1/2-1/2": interest_score += 2
    elif (result == "1-0" and not is_white) or (result == "0-1" and is_white):
        interest_score += 4 

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
        "eval_history": eval_history[-20:],
        "technical_ready": True
    }

# --- Vercel Handler ---

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            games_input = data.get("games", []) 
            username = data.get("username", "")
            
            all_analyses = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(analyze_game, g["pgn"], username, g.get("evals")) for g in games_input]
                for future in futures:
                    all_analyses.append(future.result())
            
            all_analyses.sort(key=lambda x: x.get("summary", {}).get("interest_score", 0), reverse=True)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "analyses": all_analyses}).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
