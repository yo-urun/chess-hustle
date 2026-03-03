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
   * High-Performance Move Parallelization
   * Analyzes all moves of a game simultaneously across all available workers
   */
  public async analyzeBatch(
    games: any[], 
    onProgress: (status: string) => void
  ) {
    const { Chess } = await import("chess.js");
    const results: any[] = [];

    for (let gIdx = 0; gIdx < games.length; gIdx++) {
      const game = games[gIdx];
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const history = chess.history({ verbose: true });
      
      // 1. Prepare all FENs for parallel analysis
      const movesToAnalyze: { fen: string; moveIdx: number }[] = [];
      const tempChess = new Chess();
      for (let i = 0; i < history.length; i++) {
        tempChess.move(history[i].san);
        
        // Skip if eval already exists from Lichess
        const existing = game.evals?.find((e: any) => e.move === i + 1);
        if (!existing) {
          movesToAnalyze.push({ fen: tempChess.fen(), moveIdx: i + 1 });
        }
      }

      if (movesToAnalyze.length === 0) {
        results.push(game);
        continue;
      }

      // 2. Distribute moves across the pool
      const moveEvals: any[] = [];
      const chunks = Array.from({ length: this.size }, () => [] as typeof movesToAnalyze);
      movesToAnalyze.forEach((item, index) => {
        chunks[index % this.size].push(item);
      });

      onProgress(`Партия ${gIdx + 1}/${games.length}: Параллельный анализ ${movesToAnalyze.length} ходов...`);

      const workerTasks = chunks.map(async (chunk, wIdx) => {
        const engine = this.engines[wIdx];
        for (const item of chunk) {
          const result = await engine.evaluateFen(item.fen, 150);
          if (result.cp !== undefined || result.mate !== undefined) {
            moveEvals.push({
              move: item.moveIdx,
              eval: (result.cp ?? (result.mate! * 1000)) / 100.0,
              bestMove: result.bestMove
            });
          }
        }
      });

      await Promise.all(workerTasks);
      results.push({ ...game, evals: [...(game.evals || []), ...moveEvals] });
    }

    return results;
  }

  public terminate() {
    this.engines.forEach(e => e.terminate());
    this.engines = [];
  }
}
