"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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
  Trophy,
  X
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
import { StockfishPool } from "@/lib/stockfish-pool"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [isTechnicalAnalyzing, setIsTechnicalAnalyzing] = useState(false)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [isCreatingStudio, setIsCreatingStudio] = useState(false)
  
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  const [storedGames, setStoredGames] = useState<GameRecord[]>([])
  const [deepData, setDeepData] = useState<any[] | null>(null)
  
  const [perfType, setPerfType] = useState<string>("blitz")
  const [colorFilter, setColorFilter] = useState<"white" | "black" | "all">("all")
  const [resultFilter, setResultFilter] = useState<"win" | "loss" | "draw" | "all">("all")
  const [maxGames, setMaxGames] = useState<number>(20)
  
  const [analysisProgress, setAnalysisProgress] = useState<string>("")
  const poolRef = useRef<StockfishPool | null>(null);

  useEffect(() => {
    if (selectedStudent) {
      loadInitialData();
    }
    return () => {
      poolRef.current?.terminate();
      poolRef.current = null;
    };
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

  const filteredGames = useMemo(() => {
    if (!storedGames) return [];
    return storedGames.filter(g => {
      const gPerf = (g.metadata?.perf_type || "").toLowerCase();
      const matchesPerf = perfType === "all" || gPerf === perfType || gPerf === "";
      const isWhite = g.pgn.includes(`[White "${selectedStudent?.nickname}"]`);
      const matchesColor = colorFilter === "all" || (colorFilter === "white" && isWhite) || (colorFilter === "black" && !isWhite);
      const res = (g.metadata?.result || "").toLowerCase();
      const matchesResult = resultFilter === "all" || resultFilter === res;
      return matchesPerf && matchesColor && matchesResult;
    }).slice(0, maxGames);
  }, [storedGames, perfType, colorFilter, resultFilter, maxGames, selectedStudent]);

  useEffect(() => {
    if (filteredGames.length > 0) {
      const mapped = filteredGames.map(g => ({
        id: g.lichess_id,
        opponent: g.metadata?.opponent,
        result: g.metadata?.result,
        pgn: g.pgn,
        evals: g.metadata?.evals || [],
        technicalAnalysis: g.technical_analysis,
        perfType: g.metadata?.perf_type
      }));
      setDeepData(mapped);
    } else {
      setDeepData(null);
    }
  }, [filteredGames]);

  if (!selectedStudent) return null

  const handleRemoveFromSelection = (lichessId: string) => {
    setDeepData(prev => prev ? prev.filter(g => g.id !== lichessId) : null);
  };

  const handleFetchFromLichess = async () => {
    if (!selectedStudent?.id) return;
    setIsCollecting(true);
    try {
      const options = { max: maxGames, perfType: perfType === 'all' ? undefined : perfType, color: colorFilter === 'all' ? undefined : colorFilter };
      const data = await collectStudentData(selectedStudent.nickname, options as any);
      if (data && data.length > 0) {
        await saveGamesBatch(data.map(g => ({
          lichess_id: g.id,
          student_id: selectedStudent.id!,
          pgn: g.pgn,
          metadata: { opponent: g.opponent, result: g.result, evals: g.evals, perf_type: g.perfType }
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
    if (!deepData || deepData.length === 0 || !selectedStudent?.id) return;
    const unanalyzed = deepData.filter(g => !g.technicalAnalysis);
    if (unanalyzed.length === 0) {
      alert('Все партии в текущей выборке уже подготовлены.');
      return;
    }

    setIsTechnicalAnalyzing(true);
    if (!poolRef.current) poolRef.current = new StockfishPool(2);

    try {
      setAnalysisProgress("Параллельный анализ...");
      const analyzedResults = await poolRef.current.analyzeBatch(unanalyzed, (status) => {
        setAnalysisProgress(status);
      });

      setAnalysisProgress("Синхронизация...");
      await runBatchAnalysis(selectedStudent.id, selectedStudent.nickname, analyzedResults);
      
      const updatedGames = await getStudentGames(selectedStudent.id);
      setStoredGames(updatedGames);
      alert('Техническая подготовка завершена.');
    } catch (error: any) {
      alert('Ошибка подготовки: ' + error.message);
    } finally {
      setIsTechnicalAnalyzing(false);
      setAnalysisProgress("");
    }
  };

  const handleGenerateAiReport = async () => {
    if (!selectedStudent?.id) return;
    
    // ПРЯМАЯ ПРОВЕРКА ИЗ ИСТОЧНИКА ИСТИНЫ (filteredGames)
    const readyGames = filteredGames
      .filter(g => g.technical_analysis)
      .map(g => g.technical_analysis);
    
    console.log(`[handleGenerateAiReport] Ready games found: ${readyGames.length}`);

    if (readyGames.length === 0) {
      alert('Нет подготовленных данных! Убедитесь, что рядом с партиями стоит зеленая галочка.');
      return;
    }

    setIsAIAnalyzing(true);
    try {
      const report = await generateCoachingReport(selectedStudent.nickname, readyGames, true);
      setAiReport(report);
      await saveAnalysis({
        student_id: selectedStudent.id,
        pgn: filteredGames.filter(g => g.technical_analysis).map(g => g.pgn).join('\n\n'),
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
      alert('Ошибка ИИ: ' + error.message);
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
      <div className="flex items-center justify-between bg-[#1a1a1a] border border-[#333] p-4 rounded-2xl shadow-lg">
        <Button variant="ghost" onClick={() => selectStudent(null)} className="text-[#888] hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xl font-black text-white uppercase italic tracking-widest">{selectedStudent.nickname}</span>
          <div className="h-8 w-8 rounded-lg bg-[#4fc3f7] flex items-center justify-center text-black font-black">
            {selectedStudent.nickname.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#333] p-6 rounded-3xl shadow-xl flex flex-col gap-6 border-b-4 border-b-[#4fc3f7]/20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-black tracking-widest flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-[#4fc3f7]" /> Контроль
            </Label>
            <RadioGroup value={perfType} onValueChange={setPerfType} className="flex flex-wrap gap-2">
              {['blitz', 'bullet', 'rapid', 'all'].map((t) => (
                <div key={t} className="flex-1 min-w-[60px]">
                  <RadioGroupItem value={t} id={`p-${t}`} className="sr-only" />
                  <Label htmlFor={`p-${t}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-black cursor-pointer border transition-all ${perfType === t ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                    {t.toUpperCase()}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-black tracking-widest flex items-center gap-1.5">
              <Swords className="w-3 h-3 text-[#4fc3f7]" /> Цвет
            </Label>
            <RadioGroup value={colorFilter} onValueChange={(v: any) => setColorFilter(v)} className="flex gap-2">
              {['all', 'white', 'black'].map((c) => (
                <div key={c} className="flex-1">
                  <RadioGroupItem value={c} id={`c-${c}`} className="sr-only" />
                  <Label htmlFor={`c-${c}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-black cursor-pointer border transition-all ${colorFilter === c ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                    {c === 'all' ? 'ВСЕ' : c === 'white' ? 'БЕЛ' : 'ЧЕР'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-black tracking-widest flex items-center gap-1.5">
              <Trophy className="w-3 h-3 text-[#4fc3f7]" /> Результат
            </Label>
            <RadioGroup value={resultFilter} onValueChange={(v: any) => setResultFilter(v)} className="flex gap-2">
              {['all', 'win', 'draw', 'loss'].map((r) => (
                <div key={r} className="flex-1">
                  <RadioGroupItem value={r} id={`r-${r}`} className="sr-only" />
                  <Label htmlFor={`r-${r}`} className={`w-full block text-center py-2 rounded-xl text-[10px] font-black cursor-pointer border transition-all ${resultFilter === r ? 'bg-[#4fc3f7] text-black border-[#4fc3f7]' : 'bg-[#111] text-[#666] border-[#222]'}`}>
                    {r === 'all' ? 'ВСЕ' : r === 'win' ? 'W' : r === 'draw' ? 'D' : 'L'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-[#666] uppercase font-black tracking-widest flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-[#4fc3f7]" /> Поиск (Lichess)
            </Label>
            <div className="flex items-center gap-2 bg-[#111] p-1 rounded-xl border border-[#222]">
              <Input type="number" value={maxGames} onChange={(e) => setMaxGames(parseInt(e.target.value) || 1)} className="h-8 w-full bg-transparent border-none text-xs font-black text-white focus-visible:ring-0" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
          <Button onClick={handleFetchFromLichess} disabled={isCollecting} className="h-14 rounded-2xl bg-white text-black hover:bg-[#4fc3f7] font-black text-xs uppercase tracking-widest shadow-xl">
            {isCollecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Database className="w-4 h-4 mr-2" /> 1. Загрузить игры</>}
          </Button>
          
          <Button onClick={handleTechnicalPrep} disabled={!deepData || isTechnicalAnalyzing} className="h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/20 font-black text-xs uppercase tracking-widest shadow-xl relative overflow-hidden">
            {isTechnicalAnalyzing ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-4 h-4 animate-spin mb-1" />
                <span className="text-[8px] font-mono leading-none">{analysisProgress}</span>
              </div>
            ) : <><Zap className="w-4 h-4 mr-2" /> 2. Полная подготовка</>}
          </Button>

          <Button onClick={handleGenerateAiReport} disabled={isAIAnalyzing} className="h-14 rounded-2xl bg-gradient-to-r from-[#4fc3f7] to-[#2196f3] text-black hover:opacity-90 font-black text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(79,195,247,0.4)]">
            {isAIAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><BrainCircuit className="w-4 h-4 mr-2" /> 3. ИИ-Рекомендации</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden flex flex-col max-h-[600px] shadow-2xl">
          <div className="p-4 border-b border-[#222] bg-[#111]/50 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-[#666] tracking-widest">Текущая выборка</span>
            <span className="text-[10px] font-black text-[#4fc3f7] bg-[#4fc3f7]/10 px-2 py-0.5 rounded-full">{deepData?.length || 0} игр</span>
          </div>
          <div className="overflow-y-auto custom-scrollbar">
            {deepData?.map((game) => (
              <div key={game.id} className="p-4 border-b border-[#222] hover:bg-white/[0.02] flex items-center justify-between group transition-colors">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-black flex items-center gap-2">
                    {game.technicalAnalysis ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Zap className="w-3 h-3 text-yellow-500/30" />}
                    vs {game.opponent}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase px-1.5 rounded ${game.result === 'Win' ? 'bg-green-500/10 text-green-500' : game.result === 'Loss' ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`}>
                      {game.result}
                    </span>
                    <span className="text-[9px] font-black text-[#444] uppercase tracking-tighter">{game.perfType}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`https://lichess.org/${game.id}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-[#333] hover:text-[#4fc3f7] hover:bg-white/5 transition-all">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button 
                    onClick={() => handleRemoveFromSelection(game.id)}
                    className="p-2 rounded-lg text-[#333] hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                    title="Удалить из выборки"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {(!deepData || deepData.length === 0) && <div className="p-12 text-center text-[#444] text-xs font-black uppercase italic tracking-widest">Выборка пуста</div>}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {aiReport ? (
            <div className="bg-[#1a1a1a] border-2 border-[#4fc3f7]/30 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
              <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                <h3 className="text-xs font-black text-[#4fc3f7] uppercase tracking-[0.4em] flex items-center gap-3">
                  <Sparkles className="w-5 h-5" /> Коучинг-отчет
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setAiReport(null)} className="text-[#444] hover:text-white rounded-full">ЗАКРЫТЬ</Button>
              </div>
              <div className="text-lg leading-relaxed text-white/90 whitespace-pre-wrap font-sans selection:bg-[#4fc3f7]/50">
                {aiReport}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-[#222] rounded-3xl text-[#333] gap-4 bg-[#111]/20">
              <BrainCircuit className="w-12 h-12 opacity-10" />
              <span className="text-xs font-black uppercase tracking-[0.2em] opacity-20 text-center px-12 leading-relaxed">
                Настройте фильтры и сформируйте<br/>профессиональный отчет
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Archive */}
      <div className="mt-8 space-y-6">
        <div className="flex items-center gap-3 text-xs font-black text-[#666] uppercase tracking-[0.3em] border-l-2 border-[#4fc3f7] pl-4">
          <Clock className="w-4 h-4" /> Архив аналитики
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedAnalyses.map((analysis) => (
            <div key={analysis.id} className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-6 hover:border-[#4fc3f7]/30 transition-all group flex flex-col gap-4 shadow-xl">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-black text-white">{new Date(analysis.created_at).toLocaleDateString()}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="text-[8px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-black uppercase tracking-widest">
                      {analysis.metadata?.game_count || 0} ИГР
                    </span>
                    <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20 font-black uppercase tracking-widest">
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
        </div>
      </div>
    </div>
  )
}
