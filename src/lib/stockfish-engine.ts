/**
 * Stockfish WASM Engine Wrapper - Simplified Stable Version
 */

export class StockfishEngine {
  private worker: Worker | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.worker = new Worker('/stockfish.js');
        this.worker.onmessage = (e) => {
          // Global debug logging to see engine lifecycle
          console.log(`[Stockfish OUT]: ${e.data}`);
        };
        console.log("[Stockfish] Worker instance created.");
        this.sendCommand('uci');
      } catch (err) {
        console.error("[Stockfish] Failed to create worker:", err);
      }
    }
  }

  public sendCommand(command: string) {
    if (this.worker) {
      console.log(`[Stockfish IN]: ${command}`);
      this.worker.postMessage(command);
    }
  }

  /**
   * Wait for the engine to be ready
   */
  public async waitReady(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve();
      
      const listener = (e: MessageEvent) => {
        if (e.data === 'readyok') {
          this.worker?.removeEventListener('message', listener);
          resolve();
        }
      };
      
      this.worker.addEventListener('message', listener);
      this.sendCommand('isready');
    });
  }

  /**
   * Basic evaluation helper for a single position
   */
  public async evaluateFen(fen: string, movetime: number = 150): Promise<{ cp?: number; mate?: number; bestMove?: string }> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve({});

      let lastEval: any = {};
      
      const listener = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.startsWith('info') && msg.includes('score')) {
          const cpMatch = msg.match(/cp (-?\d+)/);
          const mateMatch = msg.match(/mate (-?\d+)/);
          const bestMoveMatch = msg.match(/pv (\w+)/);
          if (cpMatch) lastEval.cp = parseInt(cpMatch[1]);
          if (mateMatch) lastEval.mate = parseInt(mateMatch[1]);
          if (bestMoveMatch) lastEval.bestMove = bestMoveMatch[1];
        }

        if (msg.startsWith('bestmove')) {
          this.worker?.removeEventListener('message', listener);
          resolve({ ...lastEval, bestMove: msg.split(' ')[1] });
        }
      };

      this.worker.addEventListener('message', listener);
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go movetime ${movetime}`);
    });
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log("[Stockfish] Engine terminated.");
    }
  }
}
