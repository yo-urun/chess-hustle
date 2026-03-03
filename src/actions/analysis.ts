'use server';

import { fetchUserGames, type LichessGame } from './lichess';
import { callPythonAnalyst } from './python-analyst';
import { updateGameTechnicalAnalysis } from './analysis-db';

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
  }
) {
  const fetchLimit = Math.max(options.max, 100);
  const rawGames = await fetchUserGames(username, { ...options, max: fetchLimit });
  
  return rawGames.map((g: LichessGame) => {
    const isWhite = g.players.white.user?.id === username.toLowerCase();
    const perf = g.speed || g.perf || 'unknown';
    
    return {
      id: g.id,
      opponent: isWhite ? g.players.black.user?.name : g.players.white.user?.name,
      result: g.winner === (isWhite ? 'white' : 'black') ? 'Win' : (g.winner ? 'Loss' : 'Draw'),
      pgn: g.pgn || '',
      evals: g.analysis || [],
      perfType: perf
    };
  });
}
