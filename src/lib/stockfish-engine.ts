/**
 * Stockfish WASM Engine Wrapper
 * Stable version with timeouts and memory safety
 */

export class StockfishEngine {
  private worker: Worker | null = null;
  private isReady: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Use local worker from public folder
      this.worker = new Worker('/stockfish.js');
      
      this.sendCommand('uci');
      this.sendCommand('setoption name Threads value 1');
      this.sendCommand('setoption name Hash value 32');
      this.sendCommand('isready');
    }
  }

  public sendCommand(command: string) {
    this.worker?.postMessage(command);
  }

  /**
   * Evaluates position with safety timeout and message cleanup
   */
  public async evaluateFen(fen: string, movetime: number = 150): Promise<{ cp?: number; mate?: number; bestMove?: string }> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve({});

      let lastEval: any = {};
      const timeoutId = setTimeout(() => {
        console.warn(`[Stockfish] Timeout for FEN: ${fen}`);
        cleanup();
        resolve({});
      }, 5000); // 5s safety limit

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (this.worker) this.worker.onmessage = null;
      };

      this.worker.onmessage = (e: MessageEvent) => {
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
          const bestMove = msg.split(' ')[1];
          cleanup();
          resolve({ ...lastEval, bestMove });
        }
      };

      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go movetime ${movetime}`);
    });
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
