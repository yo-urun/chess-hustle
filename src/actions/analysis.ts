'use server';

import { fetchUserGames } from './lichess';
import { callPythonAnalyst } from './python-analyst';
import { updateGameTechnicalAnalysis } from './analysis-db';

export interface GameDeepData {
  id: string;
  opponent: string;
  result: string;
  pgn: string;
  evals?: any[];
  technicalAnalysis?: any;
  blunders: any[];
  perfType: string;
}

export async function runBatchAnalysis(
  studentId: string,
  username: string,
  games: { pgn: string; lichess_id: string; evals?: any[] }[]
) {
  const payload = games.map(g => ({ pgn: g.pgn, evals: g.evals }));
  const result = await callPythonAnalyst(payload, username);

  if (result.status !== 'success') {
    throw new Error(result.error || 'Analysis failed');
  }

  for (const analysis of result.analyses) {
    await updateGameTechnicalAnalysis(analysis.game_id, studentId, analysis);
  }

  return result.analyses;
}

export async function collectStudentData(
  username: string, 
  options: { 
    max: number; 
    perfType?: string; 
    color?: 'white' | 'black';
    since?: number;
    until?: number;
  }
) {
  const rawGames = await fetchUserGames(username, options);
  
  return rawGames.map(g => {
    const isWhite = g.players.white.user?.id === username.toLowerCase();
    // Извлекаем тип контроля из данных Lichess (speed или variant)
    const perf = (g as any).speed || (g as any).perf || 'unknown';
    
    return {
      id: g.id,
      opponent: isWhite ? g.players.black.user?.name : g.players.white.user?.name,
      result: g.winner === (isWhite ? 'white' : 'black') ? 'Win' : (g.winner ? 'Loss' : 'Draw'),
      pgn: g.pgn || '',
      evals: g.analysis || [],
      blunders: [],
      perfType: perf
    };
  });
}
