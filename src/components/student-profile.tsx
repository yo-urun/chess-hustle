"use client"

import { useState, useEffect } from "react"
import { useApp } from "@/lib/context/app-context"
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Loader2,
  Database,
  BrainCircuit,
  MessageSquareShare,
  Puzzle,
  ChevronLeft,
  ChevronRight,
  History,
  Clock
} from "lucide-react"
import { createLichessStudio, importPgnToStudio, sendLichessMessage } from "@/actions/lichess"
import { collectStudentData } from "@/actions/analysis"
import { callPythonAnalyst } from "@/actions/python-analyst"
import { runBatchAnalysis } from "@/actions/analysis"
import { saveAnalysis, getStudentAnalyses, SavedAnalysis } from "@/actions/analysis-db"
import { generateCoachingReport } from "@/actions/ai-coach"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [deepData, setDeepData] = useState<any[] | null>(null)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [recommendedGames, setRecommendedGames] = useState<any[] | null>(null)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  
  // ... (rest of states)

  const handlePythonAnalysis = async () => {
    if (!deepData || !selectedStudent?.id || !selectedStudent?.nickname) return;
    setIsAIAnalyzing(true);
    try {
      const pgns = deepData.map(g => g.pgn).filter(Boolean);
      
      // Используем новый пакетный анализатор
      const result = await runBatchAnalysis(
        selectedStudent.id,
        selectedStudent.nickname,
        pgns,
        isDeepAnalysis
      );
      
      // Топ-3 интересные партии для рекомендаций
      setRecommendedGames(result.analyses.slice(0, 3));

      // Генерируем отчет через LLM на основе ВСЕХ проанализированных данных
      const report = await generateCoachingReport(selectedStudent.nickname, result.analyses, true);
      setAiReport(report);

      loadSavedAnalyses();
    } catch (error: any) {
      alert(error.message || 'Ошибка при работе Python-аналитика.');
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  // ... (inside return, after Results section)
  
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 flex flex-col gap-8 text-[#e0e0e0]">
      {/* ... (existing header and cards) */}

      {/* Рекомендованные партии */}
      {recommendedGames && recommendedGames.length > 0 && (
        <div className="bg-[#1a1a1a] border border-yellow-500/20 p-8 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-sm font-black text-yellow-500 uppercase tracking-wider mb-6 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Рекомендуемые партии к разбору
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {recommendedGames.map((game, i) => (
              <div key={i} className="bg-[#2a2a2a] p-4 rounded-2xl border border-[#333] flex justify-between items-center group hover:border-yellow-500/40 transition-all">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold">vs {game.summary.is_white ? game.game_info.black : game.game_info.white} ({game.game_info.result})</span>
                  <span className="text-[10px] text-[#888] font-mono">{game.game_info.opening} • {game.summary.total_moves} ходов</span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-bold">Интерес: {game.summary.interest_score.toFixed(1)}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold">Зевки: {game.summary.blunders}</span>
                  </div>
                </div>
                <a href={game.game_info.url} target="_blank" className="p-2 rounded-xl bg-[#1f1f1f] group-hover:bg-yellow-500/20 text-[#666] group-hover:text-yellow-500 transition-all">
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Результат Анализа */}
      {/* ... (existing report section) */}

      {/* История анализов */}
      {savedAnalyses.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#888] flex items-center gap-2">
            <Clock className="w-4 h-4" /> Предыдущие анализы
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {savedAnalyses.map((analysis: any) => (
              <div
                key={analysis.id}
                className="bg-[#2a2a2a] border border-[#333] p-4 rounded-2xl hover:border-[#4fc3f7]/30 cursor-pointer transition-all group"
                onClick={() => setAiReport(analysis.report)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Анализ от {new Date(analysis.created_at).toLocaleString()}</span>
                    {analysis.analysis_type && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        analysis.analysis_type === 'deep'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {analysis.analysis_type === 'deep' ? 'Глубокий' : 'Поверхностный'}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#666] group-hover:text-[#4fc3f7] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ссылка на студию если создана */}
      {studioUrl && (
        <div className="bg-green-500/5 border border-green-500/20 p-6 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-green-400">
            <Puzzle className="w-5 h-5" />
            <span className="text-sm font-bold">Студия успешно создана!</span>
          </div>
          <a href={studioUrl} target="_blank" className="text-sm font-bold text-green-400 underline flex items-center gap-1">
            Открыть Студию <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}
    </div>
  )
}
