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
  Filter,
  Trophy,
  XCircle,
  MinusCircle
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
  
  // Filters
  const [perfType, setPerfType] = useState<string>("blitz")
  const [colorFilter, setColorFilter] = useState<"white" | "black" | "all">("all")
  const [resultFilter, setResultFilter] = useState<"win" | "loss" | "draw" | "all">("all")
  const [maxGames, setMaxGames] = useState<number>(10)
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

  // Профессиональная фильтрация по базе
  const filteredGames = useMemo(() => {
    return storedGames.filter(g => {
      // Фильтр по цвету
      const isWhite = g.pgn.includes(`[White "${selectedStudent?.nickname}"]`);
      const matchesColor = colorFilter === "all" || (colorFilter === "white" && isWhite) || (colorFilter === "black" && !isWhite);
      
      // Фильтр по результату
      const res = g.metadata.result; // 'Win', 'Loss', 'Draw'
      const matchesResult = resultFilter === "all" || resultFilter === res.toLowerCase();
      
      // Фильтр по типу контроля (если есть в PGN)
      const matchesPerf = perfType === "all" || g.pgn.includes(`[Variant "${perfType}"]`) || true;

      return matchesColor && matchesResult;
    }).slice(0, maxGames);
  }, [storedGames, colorFilter, resultFilter, maxGames, selectedStudent, perfType]);

  if (!selectedStudent) return null

  const handleFetchFromLichess = async () => {
    if (!selectedStudent?.id) return;
    setIsCollecting(true);
    try {
      const options = { 
        max: maxGames, 
        perfType: perfType === 'all' ? undefined : perfType, 
        color: colorFilter === 'all' ? undefined : colorFilter 
      };
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
        alert('В текущей выборке все партии уже подготовлены.');
        return;
      }

      const payload = toAnalyze.map(g => ({ pgn: g.pgn, lichess_id: g.lichess_id, evals: g.metadata.evals }));
      await runBatchAnalysis(selectedStudent.id, selectedStudent.nickname, payload);
      
      const updatedGames = await getStudentGames(selectedStudent.id);
      setStoredGames(updatedGames);
    } catch (error: any) {
      alert('Ошибка подготовки данных: ' + error.message);
    } finally {
      setIsTechnicalAnalyzing(false);
    }
  };

  const handleGenerateAiReport = async () => {
    if (filteredGames.length === 0 || !selectedStudent?.id) return;
    const readyGames = filteredGames.filter(g => g.technical_analysis).map(g => g.technical_analysis);
    
    if (readyGames.length === 0) {
      alert('Нет подготовленных данных! Запустите "Подготовку данных" для выбранных партий.');
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
          result_filter: resultFilter,
          color_filter: colorFilter
        }
      });

      const updatedAnalyses = await getStudentAnalyses(selectedStudent.id);
      setSavedAnalyses(updatedAnalyses);
    } catch (error: any) {
      console.error("AI Error:", error);
      alert('Ошибка ИИ (401 или другая): ' + error.message);
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleDeleteAnalysis = async (id: string) => {
    if (!confirm('Удалить отчет?')) return;
    try {
      await deleteAnalysis(id);
      setSavedAnalyses(prev => prev.filter(a => a.id !== id));
    } catch (e) { alert('Ошибка при удалении'); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-6 text-[#e0e0e0] font-sans selection:bg-[#4fc3f7]/30">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-[#1a1a1a] border border-[#333] p-4 rounded-2xl shadow-lg">
        <Button variant="ghost" onClick={() => selectStudent(null)} className="text-[#888] hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xl font-black text-white">{selectedStudent.nickname}</span>
          <div className="h-8 w-8 rounded-lg bg-[#4fc3f7] flex items-center justify-center text-black font-black">
            {selectedStudent.nickname.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Filter Panel - Always on Top */}
      <div className="bg-[#1a1a1a] border border-[#333] p-6 rounded-3xl shadow-xl flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Контроль
            </Label>
            <RadioGroup value={perfType} onValueChange={setPerfType} className="flex flex-wrap gap-2">
              {['blitz', 'bullet', 'rapid', 'all'].map((t) => (
                <div key={t} className="flex-1 min-w-[60px]">
                  <RadioGroupItem value={t} id={`p-${t}`} className="sr-only" />
                  <Label htmlFor={`p-${t}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-bold cursor-pointer border transition-all ${perfType === t ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                    {t.toUpperCase()}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Swords className="w-3 h-3" /> Цвет
            </Label>
            <RadioGroup value={colorFilter} onValueChange={(v: any) => setColorFilter(v)} className="flex gap-2">
              {['all', 'white', 'black'].map((c) => (
                <div key={c} className="flex-1">
                  <RadioGroupItem value={c} id={`c-${c}`} className="sr-only" />
                  <Label htmlFor={`c-${c}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-bold cursor-pointer border transition-all ${colorFilter === c ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                    {c === 'all' ? 'ВСЕ' : c === 'white' ? 'БЕЛ' : 'ЧЕР'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Trophy className="w-3 h-3" /> Результат
            </Label>
            <RadioGroup value={resultFilter} onValueChange={(v: any) => setResultFilter(v)} className="flex gap-2">
              {['all', 'win', 'draw', 'loss'].map((r) => (
                <div key={r} className="flex-1">
                  <RadioGroupItem value={r} id={`r-${r}`} className="sr-only" />
                  <Label htmlFor={`r-${r}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-bold cursor-pointer border transition-all ${resultFilter === r ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                    {r === 'all' ? 'ВСЕ' : r === 'win' ? 'W' : r === 'draw' ? 'D' : 'L'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Layers className="w-3 h-3" /> Кол-во
            </Label>
            <div className="flex items-center gap-2 bg-[#111] p-1 rounded-xl border border-[#222]">
              <Input type="number" value={maxGames} onChange={(e) => setMaxGames(parseInt(e.target.value) || 1)} className="h-8 w-full bg-transparent border-none text-xs font-bold text-white focus-visible:ring-0" />
            </div>
          </div>
        </div>

        {/* Unified Actions Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
          <Button onClick={handleFetchFromLichess} disabled={isCollecting} className="h-14 rounded-2xl bg-white text-black hover:bg-[#4fc3f7] font-black text-xs uppercase tracking-widest">
            {isCollecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Database className="w-4 h-4 mr-2" /> 1. Загрузить игры</>}
          </Button>
          
          <Button onClick={handleTechnicalPrep} disabled={filteredGames.length === 0 || isTechnicalAnalyzing} className="h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/20 font-black text-xs uppercase tracking-widest">
            {isTechnicalAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 mr-2" /> 2. Подготовка ({filteredGames.filter(g => !g.technical_analysis).length})</>}
          </Button>

          <Button onClick={handleGenerateAiReport} disabled={filteredGames.length === 0 || isAIAnalyzing} className="h-14 rounded-2xl bg-gradient-to-r from-[#4fc3f7] to-[#2196f3] text-black hover:opacity-90 font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(79,195,247,0.3)]">
            {isAIAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><BrainCircuit className="w-4 h-4 mr-2" /> 3. ИИ-Рекомендации</>}
          </Button>
        </div>
      </div>

      {/* Main Grid: Selection and Report */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selection Table */}
        <div className="lg:col-span-1 bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden flex flex-col max-h-[600px]">
          <div className="p-4 border-b border-[#222] bg-[#111]/50 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-[#666] tracking-tighter">Текущая выборка</span>
            <span className="text-[10px] font-black text-[#4fc3f7]">{filteredGames.length} игр</span>
          </div>
          <div className="overflow-y-auto custom-scrollbar">
            {filteredGames.map((game) => (
              <div key={game.lichess_id} className="p-4 border-b border-[#222] hover:bg-white/[0.02] flex items-center justify-between group transition-colors">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-bold flex items-center gap-2">
                    {game.technical_analysis ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Zap className="w-3 h-3 text-yellow-500/30" />}
                    vs {game.metadata.opponent}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase px-1.5 rounded ${game.metadata.result === 'Win' ? 'bg-green-500/10 text-green-500' : game.metadata.result === 'Loss' ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`}>
                      {game.metadata.result}
                    </span>
                    {game.technical_analysis && <span className="text-[9px] text-[#444]">Интерес: {game.technical_analysis.summary.interest_score.toFixed(1)}</span>}
                  </div>
                </div>
                <a href={`https://lichess.org/${game.lichess_id}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-[#333] hover:text-[#4fc3f7] hover:bg-white/5 transition-all">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
            {filteredGames.length === 0 && <div className="p-12 text-center text-[#444] text-xs font-bold uppercase italic">Выборка пуста</div>}
          </div>
        </div>

        {/* Active Report Area */}
        <div className="lg:col-span-2 space-y-6">
          {aiReport ? (
            <div className="bg-[#1a1a1a] border-2 border-[#4fc3f7]/30 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-500 relative">
              <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                <h3 className="text-xs font-black text-[#4fc3f7] uppercase tracking-[0.3em] flex items-center gap-3">
                  <Sparkles className="w-5 h-5" /> Новый коучинг-отчет
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setAiReport(null)} className="text-[#444] hover:text-white">Закрыть</Button>
              </div>
              <div className="text-lg leading-relaxed text-white/90 whitespace-pre-wrap font-serif selection:bg-[#4fc3f7]/50">
                {aiReport}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-[#222] rounded-3xl text-[#333] gap-4">
              <BrainCircuit className="w-12 h-12 opacity-20" />
              <span className="text-xs font-black uppercase tracking-widest opacity-20 text-center px-8">Настройте фильтры и создайте отчет,<br/>чтобы увидеть рекомендации ИИ</span>
            </div>
          )}
        </div>
      </div>

      {/* Archive Section */}
      <div className="mt-8 space-y-6">
        <div className="flex items-center gap-3 text-xs font-black text-[#666] uppercase tracking-[0.2em]">
          <Clock className="w-4 h-4" /> Архив аналитики
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedAnalyses.map((analysis) => (
            <div key={analysis.id} className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-6 hover:border-[#4fc3f7]/30 transition-all group flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-black text-white">{new Date(analysis.created_at).toLocaleDateString()} в {new Date(analysis.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="text-[8px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-black uppercase">
                      {analysis.metadata?.game_count || 0} игр
                    </span>
                    <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20 font-black uppercase">
                      {analysis.metadata?.perf_type || 'chess'}
                    </span>
                    <span className="text-[8px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-black uppercase">
                      {analysis.metadata?.result_filter || 'all'}
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
        </div>
      </div>
    </div>
  )
}
