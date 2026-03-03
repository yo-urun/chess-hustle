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
  try {
    console.log(`[runBatchAnalysis] Starting analysis for ${username}, ${games.length} games`);
    const payload = games.map(g => {
      const lid = g.lichess_id || (g as any).id;
      if (!lid) {
        console.warn('[runBatchAnalysis] Game missing ID:', g);
      }
      return { 
        pgn: g.pgn, 
        evals: g.evals,
        lichess_id: (lid || "").trim().toLowerCase() 
      };
    });
    
    const result = await callPythonAnalyst(payload, username);

    if (result.status !== 'success') {
      console.error('[runBatchAnalysis] Python Analyst returned error:', result.error);
      return { success: false, error: result.error || 'Analysis failed' };
    }

    const results = [];
    console.log(`[runBatchAnalysis] Successfully analyzed ${result.analyses.length} games. Updating DB...`);
    
    for (const analysis of result.analyses) {
      const gameId = analysis.game_id?.trim().toLowerCase();
      if (gameId && gameId !== "unknown") {
        try {
          if (analysis.error) {
            console.warn(`[runBatchAnalysis] Analysis for ${gameId} has error: ${analysis.error}`);
          }
          await updateGameTechnicalAnalysis(gameId, studentId, analysis);
          results.push(analysis);
        } catch (dbError: any) {
          console.error(`[runBatchAnalysis] DB Update Error for ${gameId}:`, dbError);
        }
      }
    }

    console.log(`[runBatchAnalysis] Finished. Updated ${results.length} games in DB.`);
    return { success: true, count: results.length };
  } catch (error: any) {
    console.error('[runBatchAnalysis] Critical Error:', error);
    return { success: false, error: error.message || 'Unknown error occurred during analysis synchronization' };
  }
}

export async function collectStudentData(
  username: string, 
  options: { 
    max: number; 
    perfType?: string; 
    color?: 'white' | 'black';
  }
) {
  const fetchLimit = options.max * 2; 
  const rawGames: LichessGame[] = await fetchUserGames(username, { ...options, max: fetchLimit });
  
  return rawGames.map((g: LichessGame) => {
    const isWhite = g.players.white.user?.id === username.toLowerCase();
    const perf = g.speed || g.perf || 'unknown';
    
    return {
      id: g.id.toLowerCase(), // Normalize ID
      opponent: isWhite ? g.players.black.user?.name : g.players.white.user?.name,
      result: g.winner === (isWhite ? 'white' : 'black') ? 'Win' : (g.winner ? 'Loss' : 'Draw'),
      pgn: g.pgn || '',
      evals: g.analysis || [],
      perfType: perf
    };
  });
}
