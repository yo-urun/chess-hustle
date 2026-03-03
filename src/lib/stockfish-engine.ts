/**
 * Stockfish WASM Engine Wrapper
 * Enhanced for performance with movetime support
 */

export class StockfishEngine {
  private worker: Worker | null = null;
  private onMessage: (msg: string) => void = () => {};
  private isReady: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.worker = new Worker('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js');
      this.worker.onmessage = (e) => {
        if (e.data === 'uciok') this.isReady = true;
        this.onMessage(e.data);
      };
      
      // One thread per worker in the pool is better for parallel game analysis
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
   * Evaluates position with time limit (movetime) or depth
   */
  public async evaluateFen(fen: string, movetime: number = 150): Promise<{ cp?: number; mate?: number; bestMove?: string }> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve({});

      const handleResponse = (msg: string) => {
        // Parse info depth lines
        if (msg.startsWith('info depth')) {
          const cpMatch = msg.match(/cp (-?\d+)/);
          const mateMatch = msg.match(/mate (-?\d+)/);
          const bestMoveMatch = msg.match(/pv (\w+)/);
          
          if (cpMatch || mateMatch) {
            // We keep updating internal state but only resolve on 'bestmove'
          }
        }
        
        if (msg.startsWith('bestmove')) {
          const parts = msg.split(' ');
          const bestMove = parts[1];
          
          // Try to extract final eval from the last info line if possible
          // But usually we rely on the last info line received before bestmove
          this.onMessage = () => {}; 
          resolve({ bestMove });
        }
      };

      // To get evaluation during movetime, we need to capture the last 'info' line
      let lastEval: any = {};
      this.onMessage = (msg: string) => {
        if (msg.startsWith('info') && msg.includes('score')) {
            const cpMatch = msg.match(/cp (-?\d+)/);
            const mateMatch = msg.match(/mate (-?\d+)/);
            const bestMoveMatch = msg.match(/pv (\w+)/);
            if (cpMatch) lastEval.cp = parseInt(cpMatch[1]);
            if (mateMatch) lastEval.mate = parseInt(mateMatch[1]);
            if (bestMoveMatch) lastEval.bestMove = bestMoveMatch[1];
        }
        if (msg.startsWith('bestmove')) {
            resolve({ ...lastEval, bestMove: msg.split(' ')[1] });
        }
      };

      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go movetime ${movetime}`);
    });
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}
