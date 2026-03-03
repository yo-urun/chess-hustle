/**
 * Stockfish WASM Engine Wrapper
 * Manages the chess engine in a separate Web Worker
 */

export class StockfishEngine {
  private worker: Worker | null = null;
  private onMessage: (msg: string) => void = () => {};

  constructor() {
    if (typeof window !== 'undefined') {
      // Use the multithreaded version of Stockfish from CDN
      // Note: This requires COOP/COEP headers in next.config.ts
      this.worker = new Worker('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js');
      this.worker.onmessage = (e) => this.onMessage(e.data);
      
      // Initialize with maximum threads
      const threads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
      this.sendCommand(`setoption name Threads value ${threads}`);
      this.sendCommand('setoption name Hash value 128');
      this.sendCommand('uci');
    }
  }

  public sendCommand(command: string) {
    this.worker?.postMessage(command);
  }

  public async evaluateFen(fen: string, depth: number = 15): Promise<{ cp?: number; mate?: number; bestMove?: string }> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve({});

      const handleResponse = (msg: string) => {
        if (msg.startsWith('info depth') && msg.includes(`depth ${depth}`)) {
          const cpMatch = msg.match(/cp (-?\d+)/);
          const mateMatch = msg.match(/mate (-?\d+)/);
          
          if (cpMatch || mateMatch) {
            this.onMessage = () => {}; // Unsubscribe
            const cp = cpMatch ? parseInt(cpMatch[1]) : undefined;
            const mate = mateMatch ? parseInt(mateMatch[1]) : undefined;
            const bestMoveMatch = msg.match(/pv (\w+)/);
            resolve({ cp, mate, bestMove: bestMoveMatch?.[1] });
          }
        }
        
        // Safety timeout/fallback
        if (msg.startsWith('bestmove')) {
            const bestMove = msg.split(' ')[1];
            resolve({ bestMove });
        }
      };

      this.onMessage = handleResponse;
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${depth}`);
    });
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}
