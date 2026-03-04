import { StockfishEngine } from "./stockfish-engine";
import { Chess } from "chess.js";

export class StockfishPool {
  private engines: StockfishEngine[] = [];

  constructor(size: number = 2) {
    for (let i = 0; i < size; i++) {
      this.engines.push(new StockfishEngine());
    }
  }

  /**
   * Simple Batch Analysis: One engine per full game
   */
  public async analyzeBatch(
    games: any[], 
    onProgress: (status: string) => void
  ) {
    const results: any[] = [];
    // Copy queue to avoid mutation issues
    const queue = [...games];
    const total = queue.length;
    let completed = 0;

    const worker = async (engine: StockfishEngine, wIdx: number) => {
      while (true) {
        // Safe pop from queue
        const game = queue.shift();
        if (!game) break;

        console.log(`[Worker ${wIdx}] Starting game: ${game.opponent} (${completed + 1}/${total})`);
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn);
          const history = chess.history({ verbose: true });
          const startFen = chess.header().FEN;
          const tempChess = new Chess(startFen || undefined);
          
          const evals: any[] = [];
          
          // Ensure engine is alive
          await engine.waitReady();

          for (let m = 0; m < history.length; m++) {
            tempChess.move(history[m].san);
            
            // Smart Skip (only if we have full eval)
            const existing = game.evals?.find((e: any) => e.move === m + 1 && (e.eval !== undefined || e.cp !== undefined));
            if (existing) {
              evals.push(existing);
              continue;
            }

            onProgress(`Воркер ${wIdx + 1}: Партия vs ${game.opponent} | Ход ${m + 1}/${history.length}`);
            
            const result = await engine.evaluateFen(tempChess.fen(), 250);
            if (result.cp !== undefined || result.mate !== undefined) {
              evals.push({
                move: m + 1,
                eval: (result.cp ?? (result.mate! * 1000)) / 100.0,
                bestMove: result.bestMove
              });
            }
          }
          results.push({ ...game, evals });
          completed++;
          console.log(`[Worker ${wIdx}] Finished game: ${game.opponent}. Progress: ${completed}/${total}`);
        } catch (err) {
          console.error(`[Worker ${wIdx}] Failed to analyze game:`, err);
          results.push({ ...game, error: "Failed during analysis" });
          completed++;
        }
      }
    };

    // Run parallel workers (max 2 for stability on mobile/weak PCs)
    const workerCount = Math.min(this.engines.length, total, 2);
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker(this.engines[i], i));
    }

    await Promise.all(workers);
    onProgress(`Анализ завершен (${total}/${total}). Синхронизация...`);
    return results;
  }

  public terminate() {
    this.engines.forEach(e => e.terminate());
    this.engines = [];
  }
}
