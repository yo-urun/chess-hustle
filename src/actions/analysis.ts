'use server';

import { fetchUserGames } from './lichess';
import { Chess } from 'chess.js';
import { getVerbalBoard } from '@/lib/chess-utils';
import { callPythonAnalyst } from './python-analyst';
import { saveAnalysis } from './analysis-db';

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

export async function runBatchAnalysis(
  studentId: string,
  username: string,
  pgns: string[],
  deep: boolean = true
) {
  // 1. Limit to 10 games
  const batch = pgns.slice(0, 10);

  console.log(`[runBatchAnalysis] Starting analysis for ${username}, ${batch.length} games`);

  // 2. Call Python Analyst (which is now parallel)
  const result = await callPythonAnalyst(batch, username, deep);

  if (result.status !== 'success') {
    throw new Error(result.error || 'Analysis failed');
  }

  const savedAnalyses = [];

  // 3. Save each analysis to Supabase
  for (const analysis of result.analyses) {
    try {
      const saved = await saveAnalysis({
        student_id: studentId,
        game_id: analysis.game_id,
        pgn: analysis.pgn,
        analysis_data: analysis,
        report: `Interest Score: ${analysis.summary.interest_score}, Blunders: ${analysis.summary.blunders}`,
        analysis_type: deep ? 'deep' : 'surface'
      });
      savedAnalyses.push(saved);
    } catch (e) {
      console.error(`[runBatchAnalysis] Failed to save analysis for game ${analysis.game_id}:`, e);
    }
  }

  return {
    count: savedAnalyses.length,
    analyses: result.analyses
  };
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
