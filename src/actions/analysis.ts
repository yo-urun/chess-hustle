'use server';

import { fetchUserGames, type LichessGame } from './lichess';
import { callPythonAnalyst } from './python-analyst';
import { updateGameTechnicalAnalysis } from './analysis-db';

export interface PythonAnalysisResult {
  game_id: string;
  game_info: any;
  player_color: string;
  analysis_map: Record<string, any>;
  statistics: {
    blunders: number;
    missed_tactics: number;
    brilliant_moves: number;
  };
}

export async function runBatchAnalysis(
  studentId: string,
  username: string,
  games: { pgn: string; lichess_id: string; evals?: any[] }[]
) {
  const payload = games.map(g => ({ 
    pgn: g.pgn, 
    evals: g.evals,
    lichess_id: g.lichess_id 
  }));
  
  const result = await callPythonAnalyst(payload, username);

  if (result.status !== 'success') {
    throw new Error(result.error || 'Analysis failed');
  }

  for (const analysis of result.analyses) {
    const gameId = analysis.game_id;
    if (gameId && gameId !== "unknown") {
      try {
        await updateGameTechnicalAnalysis(gameId, studentId, analysis);
      } catch (dbError) {
        console.error(`[runBatchAnalysis] DB Update Error for ${gameId}:`, dbError);
      }
    }
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
  // Lichess API отлично фильтрует по типу и цвету.
  // Мы запрашиваем чуть больше (x2), только если Lichess не может отфильтровать сам (например, результат игры)
  const fetchLimit = options.max * 2; 
  const rawGames: LichessGame[] = await fetchUserGames(username, { ...options, max: fetchLimit });
  
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
