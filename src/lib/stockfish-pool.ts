import { StockfishEngine } from "./stockfish-engine";

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
   * Processes a batch of games in parallel using available engines
   */
  public async analyzeBatch(
    games: any[], 
    onProgress: (gameIdx: number, moveIdx: number, totalMoves: number) => void
  ) {
    const queue = [...games];
    const results: any[] = [];
    const activeTasks: Promise<void>[] = [];

    const worker = async (engine: StockfishEngine, workerIdx: number) => {
      while (queue.length > 0) {
        const game = queue.shift();
        if (!game) break;

        const { Chess } = await import("chess.js");
        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const moves = chess.history();
        const evals: any[] = [];
        
        chess.reset();
        for (let m = 0; m < moves.length; m++) {
          chess.move(moves[m]);
          
          // Smart Skip: If we already have eval from Lichess, use it
          const existing = game.evals?.find((e: any) => e.move === m + 1);
          if (existing) {
            evals.push(existing);
            continue;
          }

          // Granular progress callback
          onProgress(workerIdx, m + 1, moves.length);

          const result = await engine.evaluateFen(chess.fen(), 150); // 150ms limit
          if (result.cp !== undefined || result.mate !== undefined) {
            evals.push({
              move: m + 1,
              eval: (result.cp ?? (result.mate! * 1000)) / 100.0,
              bestMove: result.bestMove
            });
          }
        }
        results.push({ ...game, evals: [...(game.evals || []), ...evals] });
      }
    };

    // Launch workers
    for (let i = 0; i < this.engines.length; i++) {
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
