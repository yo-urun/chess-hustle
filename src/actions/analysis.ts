'use server';

import { fetchUserGames } from './lichess';
import { Chess } from 'chess.js';
import { getVerbalBoard } from '@/lib/chess-utils';

export interface GameDeepData {
  id: string;
  opponent: string;
  result: string;
  blunders: {
    move: number;
    played: string;
    best: string;
    pv: string;
    evalBefore: number;
    evalAfter: number;
    diff: number;
    boardDescription: string;
  }[];
}

export async function collectStudentData(username: string, maxGames: number = 50) {
  const rawGames = await fetchUserGames(username, { max: maxGames, perfType: 'blitz' });
  const processedData: GameDeepData[] = [];

  for (const g of rawGames) {
    if (!g.analysis) continue; // Нам нужны только проанализированные партии

    const chess = new Chess();
    const moves = g.moves.split(' ');
    const isWhite = g.players.white.user?.id === username.toLowerCase();
    
    const gameRecord: GameDeepData = {
      id: g.id,
      opponent: isWhite ? g.players.black.user?.name : g.players.white.user?.name,
      result: g.winner === (isWhite ? 'white' : 'black') ? 'Win' : 'Loss',
      blunders: []
    };

    let lastEval = 0;
    
    for (let i = 0; i < moves.length; i++) {
      const fenBefore = chess.fen();
      const movePlayed = moves[i];
      
      try {
        chess.move(movePlayed);
        const currentEval = g.analysis[i]?.eval ?? lastEval;
        const diff = isWhite ? (lastEval - currentEval) : (currentEval - lastEval);

        // Если это зевок (> 2 пешек)
        if (diff > 200) {
          gameRecord.blunders.push({
            move: Math.floor(i/2) + 1,
            played: movePlayed,
            best: g.analysis[i]?.best || '?',
            pv: g.analysis[i]?.pv || '',
            evalBefore: lastEval,
            evalAfter: currentEval,
            diff: diff,
            boardDescription: getVerbalBoard(fenBefore)
          });
        }
        
        lastEval = currentEval;
      } catch (e) { break; }
    }

    if (gameRecord.blunders.length > 0) {
      processedData.push(gameRecord);
    }
  }

  return processedData;
}
