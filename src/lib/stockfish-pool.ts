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
    const queue = [...games];
    const activeTasks: Promise<void>[] = [];

    const worker = async (engine: StockfishEngine, wIdx: number) => {
      while (queue.length > 0) {
        const game = queue.shift();
        if (!game) break;

        console.log(`[Worker ${wIdx}] Starting game: ${game.opponent}`);
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn);
          const history = chess.history({ verbose: true });
          const startFen = chess.header().FEN;
          const tempChess = new Chess(startFen || undefined);
          
          const evals: any[] = [];
          
          // Ensure engine is alive
          await engine.waitReady();

          for (let i = 0; i < history.length; i++) {
            tempChess.move(history[i].san);
            
            // Smart Skip
            const existing = game.evals?.find((e: any) => e.move === i + 1);
            if (existing) {
              evals.push(existing);
              continue;
            }

            onProgress(`Воркер ${wIdx + 1}: Партия против ${game.opponent} | Ход ${i + 1}/${history.length}`);
            
            const result = await engine.evaluateFen(tempChess.fen(), 150);
            if (result.cp !== undefined || result.mate !== undefined) {
              evals.push({
                move: i + 1,
                eval: (result.cp ?? (result.mate! * 1000)) / 100.0,
                bestMove: result.bestMove
              });
            }
          }
          results.push({ ...game, evals: [...(game.evals || []), ...evals] });
        } catch (err) {
          console.error(`[Worker ${wIdx}] Failed to analyze game:`, err);
          results.push(game); // Return raw game on failure
        }
      }
    };

    // Run 2 parallel workers max for stability
    for (let i = 0; i < Math.min(this.engines.length, 2); i++) {
      activeTasks.push(worker(this.engines[i], i));
    }

    await Promise.all(activeTasks);
    return results;
  }

  public terminate() {
    this.engines.forEach(e => e.terminate());
    this.engines = [];
  }
}
