import { StockfishEngine } from "./stockfish-engine";
import { Chess } from "chess.js";

export class StockfishPool {
  private engines: StockfishEngine[] = [];
  private size: number;

  constructor(size: number = 4) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      this.engines.push(new StockfishEngine());
    }
  }

  /**
   * Ultra-Parallel Analysis with Error Isolation
   */
  public async analyzeBatch(
    games: any[], 
    onProgress: (status: string) => void
  ) {
    const results: any[] = [];

    for (let gIdx = 0; gIdx < games.length; gIdx++) {
      try {
        const game = games[gIdx];
        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const history = chess.history({ verbose: true });
        
        const movesToAnalyze: { fen: string; moveIdx: number }[] = [];
        const tempChess = new Chess();
        for (let i = 0; i < history.length; i++) {
          tempChess.move(history[i].san);
          const existing = game.evals?.find((e: any) => e.move === i + 1);
          if (!existing) {
            movesToAnalyze.push({ fen: tempChess.fen(), moveIdx: i + 1 });
          }
        }

        if (movesToAnalyze.length === 0) {
          results.push(game);
          continue;
        }

        const moveEvals: any[] = [];
        const chunks = Array.from({ length: this.size }, () => [] as typeof movesToAnalyze);
        movesToAnalyze.forEach((item, index) => {
          chunks[index % this.size].push(item);
        });

        onProgress(`Партия ${gIdx + 1}/${games.length}: Анализ ${movesToAnalyze.length} ходов...`);

        const workerTasks = chunks.map(async (chunk, wIdx) => {
          const engine = this.engines[wIdx];
          for (const item of chunk) {
            try {
              const result = await engine.evaluateFen(item.fen, 150);
              if (result.cp !== undefined || result.mate !== undefined) {
                moveEvals.push({
                  move: item.moveIdx,
                  eval: (result.cp ?? (result.mate! * 1000)) / 100.0,
                  bestMove: result.bestMove
                });
              }
            } catch (moveErr) {
              console.error(`[Worker ${wIdx}] Move error:`, moveErr);
            }
          }
        });

        await Promise.all(workerTasks);
        results.push({ ...game, evals: [...(game.evals || []), ...moveEvals] });
      } catch (gameErr) {
        console.error(`Error analyzing game ${gIdx}:`, gameErr);
        results.push(games[gIdx]); // Fallback to raw game if failed
      }
    }

    return results;
  }

  public terminate() {
    this.engines.forEach(e => e.terminate());
    this.engines = [];
  }
}
