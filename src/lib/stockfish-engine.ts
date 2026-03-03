/**
 * Stockfish WASM Engine Wrapper
 * Stable version with semaphore and enhanced timeouts
 */

export class StockfishEngine {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private isAnalyzing: boolean = false; // Semaphore to prevent concurrent commands

  constructor() {
    if (typeof window !== 'undefined') {
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
   * Evaluates position with safety timeout and concurrent analysis protection
   */
  public async evaluateFen(fen: string, movetime: number = 150): Promise<{ cp?: number; mate?: number; bestMove?: string }> {
    // If already analyzing, we wait or resolve empty
    if (this.isAnalyzing) {
        console.warn("[Stockfish] Concurrent analysis attempt blocked.");
        return {};
    }

    return new Promise((resolve) => {
      if (!this.worker) return resolve({});

      this.isAnalyzing = true;
      let lastEval: any = {};
      
      const timeoutId = setTimeout(() => {
        console.warn(`[Stockfish] 10s Timeout for FEN: ${fen}`);
        this.sendCommand('stop'); // Stop the engine search
        cleanup();
        resolve({});
      }, 10000); // Increased to 10s

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (this.worker) this.worker.onmessage = null;
        this.isAnalyzing = false;
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
      this.isAnalyzing = false;
    }
  }
}
