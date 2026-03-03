"use client"

import { useState, useEffect, useMemo } from "react"
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
  ChevronRight,
  Clock,
  Swords,
  Layers,
  CheckCircle2,
  Zap,
  Trash2,
  Settings2,
  BarChart3,
  Calendar,
  Filter
} from "lucide-react"
import { createLichessStudio, importPgnToStudio, sendLichessMessage } from "@/actions/lichess"
import { collectStudentData, runBatchAnalysis } from "@/actions/analysis"
import { 
  saveAnalysis, 
  getStudentAnalyses, 
  SavedAnalysis, 
  saveGamesBatch, 
  getStudentGames, 
  GameRecord, 
  updateGameTechnicalAnalysis,
  deleteAnalysis 
} from "@/actions/analysis-db"
import { generateCoachingReport } from "@/actions/ai-coach"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [isTechnicalAnalyzing, setIsTechnicalAnalyzing] = useState(false)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [isCreatingStudio, setIsCreatingStudio] = useState(false)
  
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  const [storedGames, setStoredGames] = useState<GameRecord[]>([])
  
  // Unified Filters
  const [perfType, setPerfType] = useState<string>("blitz")
  const [colorFilter, setColorFilter] = useState<"white" | "black" | "all">("all")
  const [maxGames, setMaxGames] = useState<number>(20)
  const [studioUrl, setStudioUrl] = useState<string | null>(null)

  useEffect(() => {
    if (selectedStudent) {
      loadInitialData();
    }
  }, [selectedStudent]);

  const loadInitialData = async () => {
    if (!selectedStudent?.id) return;
    setIsCollecting(true);
    try {
      const [analyses, games] = await Promise.all([
        getStudentAnalyses(selectedStudent.id),
        getStudentGames(selectedStudent.id)
      ]);
      setSavedAnalyses(analyses);
      setStoredGames(games);
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setIsCollecting(false);
    }
  };

  // Фильтрация игр, которые уже есть в базе данных
  const filteredGames = useMemo(() => {
    return storedGames.filter(g => {
      const metadata = g.metadata || {};
      const matchesPerf = perfType === "all" || g.pgn.includes(`[Variant "${perfType}"]`) || true; // Lichess PGN check is complex, usually we rely on Lichess API filter during fetch
      const isWhite = g.pgn.includes(`[White "${selectedStudent?.nickname}"]`);
      const matchesColor = colorFilter === "all" || (colorFilter === "white" && isWhite) || (colorFilter === "black" && !isWhite);
      return matchesColor;
    }).slice(0, maxGames);
  }, [storedGames, perfType, colorFilter, maxGames, selectedStudent]);

  if (!selectedStudent) return null

  const handleFetchFromLichess = async () => {
    if (!selectedStudent?.id) return;
    setIsCollecting(true);
    try {
      const options = { max: maxGames, perfType: perfType, color: colorFilter === 'all' ? undefined : colorFilter };
      const data = await collectStudentData(selectedStudent.nickname, options as any);
      
      if (data.length > 0) {
        await saveGamesBatch(data.map(g => ({
          lichess_id: g.id,
          student_id: selectedStudent.id!,
          pgn: g.pgn,
          metadata: { opponent: g.opponent, result: g.result, evals: g.evals }
        })));
        const updatedGames = await getStudentGames(selectedStudent.id);
        setStoredGames(updatedGames);
      }
    } catch (error: any) {
      alert('Ошибка Lichess: ' + error.message);
    } finally {
      setIsCollecting(false);
    }
  };

  const handleTechnicalPrep = async () => {
    if (filteredGames.length === 0 || !selectedStudent?.id) return;
    setIsTechnicalAnalyzing(true);
    try {
      const toAnalyze = filteredGames.filter(g => !g.technical_analysis).slice(0, 10);
      if (toAnalyze.length === 0) {
        alert('Все выбранные партии уже имеют технический анализ.');
        return;
      }

      const payload = toAnalyze.map(g => ({ pgn: g.pgn, lichess_id: g.lichess_id, evals: g.metadata.evals }));
      await runBatchAnalysis(selectedStudent.id, selectedStudent.nickname, payload);
      
      const updatedGames = await getStudentGames(selectedStudent.id);
      setStoredGames(updatedGames);
    } catch (error: any) {
      alert('Ошибка тех. анализа: ' + error.message);
    } finally {
      setIsTechnicalAnalyzing(false);
    }
  };

  const handleGenerateAiReport = async () => {
    if (filteredGames.length === 0 || !selectedStudent?.id) return;
    const readyGames = filteredGames.filter(g => g.technical_analysis).map(g => g.technical_analysis);
    
    if (readyGames.length === 0) {
      alert('Нет подготовленных данных для этой выборки. Сначала запустите "Тех. Подготовку".');
      return;
    }

    setIsAIAnalyzing(true);
    try {
      const report = await generateCoachingReport(selectedStudent.nickname, readyGames, true);
      setAiReport(report);

      await saveAnalysis({
        student_id: selectedStudent.id,
        pgn: filteredGames.map(g => g.pgn).join('\n\n'),
        analysis_data: readyGames,
        report: report,
        metadata: {
          game_count: readyGames.length,
          perf_type: perfType,
          date_range: new Date().toLocaleDateString()
        }
      });

      const updatedAnalyses = await getStudentAnalyses(selectedStudent.id);
      setSavedAnalyses(updatedAnalyses);
    } catch (error: any) {
      alert('Ошибка ИИ: ' + error.message);
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleDeleteAnalysis = async (id: string) => {
    if (!confirm('Удалить этот отчет из архива?')) return;
    try {
      await deleteAnalysis(id);
      setSavedAnalyses(prev => prev.filter(a => a.id !== id));
      if (aiReport && savedAnalyses.find(a => a.id === id)?.report === aiReport) {
        setAiReport(null);
      }
    } catch (e) {
      alert('Ошибка при удалении');
    }
  };

  const handleCreateStudio = async () => {
    if (filteredGames.length === 0 || !selectedStudent?.nickname) return;
    setIsCreatingStudio(true);
    try {
      const studioName = `Анализ: ${selectedStudent.nickname} (${new Date().toLocaleDateString()})`;
      const { id: studioId } = await createLichessStudio(studioName);
      const url = `https://lichess.org/study/${studioId}`;
      for (const game of filteredGames.slice(0, 10)) {
        await importPgnToStudio(studioId, game.pgn, `vs ${game.metadata.opponent}`);
      }
      await sendLichessMessage(selectedStudent.nickname, `Твой шахматный отчет готов: ${url}`);
      setStudioUrl(url);
      alert('Студия создана!');
    } catch (error: any) {
      alert('Ошибка студии: ' + error.message);
    } finally {
      setIsCreatingStudio(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col gap-8 text-[#e0e0e0] font-sans">
      {/* Header & Back */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => selectStudent(null)} className="text-[#888] hover:text-white hover:bg-white/5 rounded-full px-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Список учеников
        </Button>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <div className="text-sm font-bold text-white">{selectedStudent.nickname}</div>
            <div className="text-[10px] text-[#666] uppercase tracking-widest">Lichess Student</div>
          </div>
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#2196f3] flex items-center justify-center text-black font-black">
            {selectedStudent.nickname.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sidebar: Controls */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-black text-[#4fc3f7] uppercase tracking-tighter">
              <Settings2 className="w-4 h-4" /> Фильтры выборки
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] text-[#666] uppercase font-bold">Контроль времени</Label>
                <RadioGroup value={perfType} onValueChange={setPerfType} className="grid grid-cols-2 gap-2">
                  {['bullet', 'blitz', 'rapid', 'all'].map((t) => (
                    <div key={t} className="flex items-center">
                      <RadioGroupItem value={t} id={`perf-${t}`} className="sr-only" />
                      <Label htmlFor={`perf-${t}`} className={`w-full text-center py-2 rounded-xl text-[10px] font-bold cursor-pointer border transition-all ${perfType === t ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222] hover:border-[#444]'}`}>
                        {t.toUpperCase()}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] text-[#666] uppercase font-bold">Цвет фигур</Label>
                <RadioGroup value={colorFilter} onValueChange={(v: any) => setColorFilter(v)} className="flex gap-2">
                  {['all', 'white', 'black'].map((c) => (
                    <div key={c} className="flex-1">
                      <RadioGroupItem value={c} id={`color-${c}`} className="sr-only" />
                      <Label htmlFor={`color-${c}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-bold cursor-pointer border transition-all ${colorFilter === c ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                        {c === 'all' ? 'ВСЕ' : c === 'white' ? 'БЕЛ' : 'ЧЕР'}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] text-[#666] uppercase font-bold">Глубина выборки</Label>
                <div className="flex items-center gap-3 bg-[#111] p-2 rounded-xl border border-[#222]">
                  <Input type="number" value={maxGames} onChange={(e) => setMaxGames(parseInt(e.target.value) || 1)} className="h-6 w-full bg-transparent border-none text-xs font-bold text-white focus-visible:ring-0" />
                  <span className="text-[10px] text-[#444] font-bold">GAMES</span>
                </div>
              </div>
            </div>

            <Button onClick={handleFetchFromLichess} disabled={isCollecting} className="w-full py-6 rounded-2xl bg-white text-black hover:bg-[#4fc3f7] font-black text-xs uppercase tracking-widest transition-all">
              {isCollecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Database className="w-4 h-4 mr-2" /> Обновить данные</>}
            </Button>
          </div>

          {/* Stats Card */}
          <div className="bg-gradient-to-br from-[#222] to-[#111] border border-[#333] rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-[#666] uppercase">Статистика базы</span>
              <BarChart3 className="w-4 h-4 text-[#4fc3f7]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-black text-white">{storedGames.length}</div>
                <div className="text-[9px] text-[#666] uppercase">Всего партий</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#4fc3f7]">{storedGames.filter(g => g.technical_analysis).length}</div>
                <div className="text-[9px] text-[#666] uppercase">Подготовлено</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3 flex flex-col gap-8">
          {/* Action Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={handleTechnicalPrep} disabled={filteredGames.length === 0 || isTechnicalAnalyzing} className="flex flex-col items-start gap-3 p-6 bg-[#1a1a1a] border border-yellow-500/20 rounded-3xl hover:border-yellow-500/50 transition-all disabled:opacity-50 text-left group">
              <div className="p-3 bg-yellow-500/10 rounded-2xl text-yellow-500 group-hover:scale-110 transition-transform">
                {isTechnicalAnalyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-sm font-black text-white uppercase italic">1. Тех. Подготовка</div>
                <div className="text-[10px] text-[#666] leading-tight mt-1">Stockfish анализ и паттерны</div>
              </div>
            </button>

            <button onClick={handleGenerateAiReport} disabled={filteredGames.length === 0 || isAIAnalyzing} className="flex flex-col items-start gap-3 p-6 bg-[#1a1a1a] border border-[#4fc3f7]/20 rounded-3xl hover:border-[#4fc3f7]/50 transition-all disabled:opacity-50 text-left group">
              <div className="p-3 bg-[#4fc3f7]/10 rounded-2xl text-[#4fc3f7] group-hover:scale-110 transition-transform">
                {isAIAnalyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <BrainCircuit className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-sm font-black text-white uppercase italic">2. ИИ-Рекомендации</div>
                <div className="text-[10px] text-[#666] leading-tight mt-1">Генерация коучинг-отчета</div>
              </div>
            </button>

            <button onClick={handleCreateStudio} disabled={filteredGames.length === 0 || isCreatingStudio} className="flex flex-col items-start gap-3 p-6 bg-[#1a1a1a] border border-green-500/20 rounded-3xl hover:border-green-500/50 transition-all disabled:opacity-50 text-left group">
              <div className="p-3 bg-green-500/10 rounded-2xl text-green-500 group-hover:scale-110 transition-transform">
                {isCreatingStudio ? <Loader2 className="w-6 h-6 animate-spin" /> : <MessageSquareShare className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-sm font-black text-white uppercase italic">3. Студия Lichess</div>
                <div className="text-[10px] text-[#666] leading-tight mt-1">Экспорт в учебник Lichess</div>
              </div>
            </button>
          </div>

          {/* Game Selection Table */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-[#222] flex justify-between items-center bg-[#111]/50">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#4fc3f7]" /> Текущая выборка ({filteredGames.length})
              </h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-green-500/70">
                  <CheckCircle2 className="w-3 h-3" /> ГОТОВЫ К ИИ
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-yellow-500/70">
                  <Zap className="w-3 h-3" /> НУЖЕН STOCKFISH
                </div>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#1a1a1a] text-[9px] text-[#444] uppercase font-black tracking-widest border-b border-[#222]">
                  <tr>
                    <th className="px-6 py-3">Статус</th>
                    <th className="px-6 py-3">Оппонент</th>
                    <th className="px-6 py-3">Результат</th>
                    <th className="px-6 py-3">Интерес</th>
                    <th className="px-6 py-3 text-right">Линк</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-[#222]">
                  {filteredGames.map((game) => (
                    <tr key={game.lichess_id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        {game.technical_analysis ? (
                          <div className="flex items-center gap-2 text-green-500 font-bold">
                            <CheckCircle2 className="w-4 h-4" /> <span className="text-[10px]">READY</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-yellow-500/50">
                            <Zap className="w-4 h-4" /> <span className="text-[10px]">RAW</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-[#e0e0e0]">vs {game.metadata.opponent}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${game.metadata.result === 'Win' ? 'bg-green-500/10 text-green-500' : game.metadata.result === 'Loss' ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`}>
                          {game.metadata.result}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-[#666]">
                        {game.technical_analysis?.summary?.interest_score?.toFixed(1) || '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a href={`https://lichess.org/${game.lichess_id}`} target="_blank" rel="noopener noreferrer" className="inline-block p-2 rounded-lg hover:bg-white/10 text-[#444] hover:text-[#4fc3f7] transition-all">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {filteredGames.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-[#444] italic">
                        Нет партий в выборке. Попробуйте «Обновить данные» или изменить фильтры.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Report Output */}
          {aiReport && (
            <div className="bg-[#1a1a1a] border-2 border-[#4fc3f7]/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(79,195,247,0.1)] animate-in fade-in slide-in-from-bottom-4 duration-700 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#4fc3f7]"></div>
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xs font-black text-[#4fc3f7] uppercase tracking-[0.3em] flex items-center gap-3">
                  <Sparkles className="w-5 h-5" /> Сгенерированный ИИ-Отчет
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setAiReport(null)} className="text-[#444] hover:text-white rounded-full">Закрыть</Button>
              </div>
              <div className="text-lg leading-relaxed text-white/90 whitespace-pre-wrap font-serif selection:bg-[#4fc3f7]/30">
                {aiReport}
              </div>
            </div>
          )}

          {/* Archive Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-xs font-black text-[#666] uppercase tracking-widest">
              <Clock className="w-4 h-4" /> Архив аналитических отчетов
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedAnalyses.map((analysis) => (
                <div key={analysis.id} className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-6 hover:border-[#4fc3f7]/30 transition-all group flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-black text-white flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-[#4fc3f7]" /> {new Date(analysis.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-black uppercase">
                          {analysis.metadata?.game_count || 0} партий
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-black uppercase">
                          {analysis.metadata?.perf_type || 'MIXED'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteAnalysis(analysis.id)} className="p-2 rounded-xl text-[#333] hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Button variant="ghost" onClick={() => setAiReport(analysis.report)} className="w-full justify-between py-6 rounded-2xl bg-[#111] hover:bg-[#222] border border-[#222] text-[#888] hover:text-white transition-all group/btn">
                    <span className="text-[10px] font-black uppercase tracking-widest">Открыть отчет</span>
                    <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                </div>
              ))}
              {savedAnalyses.length === 0 && (
                <div className="md:col-span-2 py-12 text-center border-2 border-dashed border-[#222] rounded-3xl text-[#333] text-sm font-bold uppercase tracking-tighter">
                  Архив пуст. Создайте свой первый отчет!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
