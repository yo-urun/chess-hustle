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
  Clock,
  Swords,
  Layers,
  CheckCircle2,
  Zap,
  BookOpen
} from "lucide-react"
import { createLichessStudio, importPgnToStudio, sendLichessMessage } from "@/actions/lichess"
import { collectStudentData, runBatchAnalysis } from "@/actions/analysis"
import { saveAnalysis, getStudentAnalyses, SavedAnalysis, saveGamesBatch, getStudentGames, GameRecord, updateGameTechnicalAnalysis } from "@/actions/analysis-db"
import { generateCoachingReport } from "@/actions/ai-coach"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [deepData, setDeepData] = useState<any[] | null>(null)
  const [isTechnicalAnalyzing, setIsTechnicalAnalyzing] = useState(false)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [recommendedGames, setRecommendedGames] = useState<any[] | null>(null)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  const [storedGames, setStoredGames] = useState<GameRecord[]>([])
  
  // States for Studio and Filters
  const [isCreatingStudio, setIsCreatingStudio] = useState(false)
  const [perfType, setPerfType] = useState<string>("blitz")
  const [maxGames, setMaxGames] = useState<number>(20)
  const [color, setColor] = useState<"white" | "black" | "all">("all")
  const [isDeepAnalysis, setIsDeepAnalysis] = useState(true)
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
      
      if (games.length > 0) {
        syncDeepDataFromStored(games);
      }
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setIsCollecting(false);
    }
  };

  const syncDeepDataFromStored = (games: GameRecord[]) => {
    setDeepData(games.map(g => ({
      id: g.lichess_id,
      opponent: g.metadata.opponent,
      result: g.metadata.result,
      pgn: g.pgn,
      blunders: g.metadata.blunders || [],
      technicalAnalysis: g.technical_analysis
    })));
  };

  if (!selectedStudent) return null

  const handleDeepCollect = async () => {
    if (!selectedStudent?.id) return;
    setIsCollecting(true);
    try {
      const options: any = { max: maxGames, perfType: perfType };
      if (color !== "all") options.color = color;

      const data = await collectStudentData(selectedStudent.nickname, options);
      
      if (data.length > 0 && selectedStudent.id) {
        const studentId = selectedStudent.id; 
        try {
          await saveGamesBatch(data.map(g => ({
            lichess_id: g.id,
            student_id: studentId,
            pgn: g.pgn,
            metadata: {
              opponent: g.opponent,
              result: g.result,
              blunders: g.blunders
            }
          })));
          const updatedGames = await getStudentGames(studentId);
          setStoredGames(updatedGames);
          syncDeepDataFromStored(updatedGames);
        } catch (dbError: any) {
          console.error('[DB Error]', dbError);
          setDeepData(data);
        }
      }
    } catch (error: any) {
      alert('Ошибка при сборе истории: ' + error.message);
    } finally {
      setIsCollecting(false);
    }
  };

  const handleTechnicalPrep = async () => {
    if (!deepData || deepData.length === 0 || !selectedStudent?.id) return;
    
    setIsTechnicalAnalyzing(true);
    try {
      const toAnalyze = deepData.filter(g => !g.technicalAnalysis).slice(0, 10);
      
      if (toAnalyze.length === 0) {
        alert('Все выбранные партии уже подготовлены!');
        return;
      }

      const pgns = toAnalyze.map(g => g.pgn);
      const result = await runBatchAnalysis(selectedStudent.id, selectedStudent.nickname, pgns, isDeepAnalysis);
      
      for (const analysis of result.analyses) {
        await updateGameTechnicalAnalysis(analysis.game_id, selectedStudent.id, analysis);
      }

      const updatedGames = await getStudentGames(selectedStudent.id);
      setStoredGames(updatedGames);
      syncDeepDataFromStored(updatedGames);
      
      alert(`Подготовлено ${result.analyses.length} партий.`);
    } catch (error: any) {
      alert('Ошибка при подготовке данных: ' + error.message);
    } finally {
      setIsTechnicalAnalyzing(false);
    }
  };

  const handleAiReport = async () => {
    if (!deepData || !selectedStudent?.id) return;
    
    const readyGames = deepData.filter(g => g.technicalAnalysis).map(g => g.technicalAnalysis);
    
    if (readyGames.length === 0) {
      alert('Сначала подготовьте данные!');
      return;
    }

    setIsAIAnalyzing(true);
    try {
      const sortedAnalyses = [...readyGames].sort((a, b) => b.summary.interest_score - a.summary.interest_score);
      setRecommendedGames(sortedAnalyses.slice(0, 3));

      const report = await generateCoachingReport(selectedStudent.nickname, sortedAnalyses, true);
      setAiReport(report);

      await saveAnalysis({
        student_id: selectedStudent.id,
        pgn: sortedAnalyses.map(a => a.pgn).join('\n\n'),
        analysis_data: sortedAnalyses,
        report: report,
        analysis_type: isDeepAnalysis ? 'deep' : 'surface',
        metadata: {
          game_count: readyGames.length,
          perf_type: perfType,
          date_range: new Date().toLocaleDateString()
        }
      });

      const analyses = await getStudentAnalyses(selectedStudent.id);
      setSavedAnalyses(analyses);
    } catch (error: any) {
      alert('Ошибка при генерации отчета: ' + error.message);
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleCreateStudio = async () => {
    if (!deepData || !selectedStudent?.nickname) return;
    setIsCreatingStudio(true);
    try {
      const studioName = `Разбор для ${selectedStudent.nickname} (${new Date().toLocaleDateString()})`;
      const { id: studioId } = await createLichessStudio(studioName);
      const url = `https://lichess.org/study/${studioId}`;
      for (const game of deepData) {
        await importPgnToStudio(studioId, game.pgn, `vs ${game.opponent}`);
      }
      const message = `Привет! Я подготовил студию: ${url}`;
      await sendLichessMessage(selectedStudent.nickname, message);
      setStudioUrl(url);
      alert('Студия отправлена!');
    } catch (error: any) {
      alert('Ошибка студии: ' + error.message);
    } finally {
      setIsCreatingStudio(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 flex flex-col gap-8 text-[#e0e0e0]">
      <div className="flex items-center justify-between">
        <button onClick={() => selectStudent(null)} className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#e0e0e0] transition-colors group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Назад к списку
        </button>
        <a href={`https://lichess.org/@/${selectedStudent.nickname}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4fc3f7] hover:underline flex items-center gap-1">
          Lichess Профиль <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-col gap-6 bg-[#2a2a2a] p-8 rounded-3xl border border-[#333]">
        <div className="flex items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#4fc3f7]/10 text-[#4fc3f7] text-3xl font-bold border border-[#4fc3f7]/20 shadow-inner">
            {selectedStudent.nickname.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-black tracking-tight">{selectedStudent.nickname}</h1>
            <p className="text-[#666] mt-1 font-medium italic">Двухэтапный ИИ-Анализ</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
          <div className="space-y-2">
            <Label className="text-xs text-[#888] uppercase tracking-wider">Контроль</Label>
            <RadioGroup value={perfType} onValueChange={setPerfType} className="flex gap-2">
              {['bullet', 'blitz', 'rapid'].map((t) => (
                <div key={t} className="flex items-center space-x-2">
                  <RadioGroupItem value={t} id={t} className="sr-only" />
                  <Label htmlFor={t} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${perfType === t ? 'bg-[#4fc3f7] text-black' : 'bg-[#1f1f1f] text-[#888]'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-[#888] uppercase tracking-wider">Кол-во партий</Label>
            <Input type="number" value={maxGames} onChange={(e) => setMaxGames(parseInt(e.target.value) || 20)} className="h-8 w-20 bg-[#1f1f1f] border-[#333] text-xs" min={1} max={50} />
          </div>

          <div className="flex items-end">
            <Button onClick={handleDeepCollect} disabled={isCollecting} className="w-full h-10 rounded-xl bg-[#4fc3f7] text-black hover:bg-[#4fc3f7]/90 font-bold">
              {isCollecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              Загрузить из Lichess
            </Button>
          </div>
        </div>
      </div>

      {deepData && deepData.length > 0 && (
        <div className="bg-[#2a2a2a] border border-blue-500/20 p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" /> Партий в выборке: {deepData.length}
            </h3>
            <span className="text-[10px] text-[#666]">Всего в базе: {storedGames.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {deepData.map((game) => (
              <div key={game.id} className={`p-3 rounded-xl border flex items-center justify-between ${game.technicalAnalysis ? 'bg-[#1f1f1f] border-green-500/30' : 'bg-[#1f1f1f] border-[#333]'}`}>
                <div className="flex flex-col">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    {game.technicalAnalysis && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    vs {game.opponent}
                  </span>
                  <span className={`text-[10px] font-bold ${game.result === 'Win' ? 'text-green-500' : game.result === 'Loss' ? 'text-red-500' : 'text-gray-500'}`}>
                    {game.result} {game.technicalAnalysis && `• Интерес: ${game.technicalAnalysis.summary.interest_score.toFixed(1)}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!game.technicalAnalysis && (
                    <span title="Требуется подготовка">
                      <Zap className="w-3 h-3 text-yellow-500/50" />
                    </span>
                  )}
                  <ExternalLink className="w-3 h-3 text-[#444]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ШАГ 1: Stockfish */}
        <div className="bg-[#2a2a2a] border border-[#333] p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden group">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-bold">1. Тех. Анализ</h2>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#1f1f1f] border border-[#333]">
            <input type="checkbox" id="deep-prep" checked={isDeepAnalysis} onChange={(e) => setIsDeepAnalysis(e.target.checked)} className="w-3 h-3 rounded text-[#4fc3f7]" />
            <Label htmlFor="deep-prep" className="text-[10px] text-[#888] cursor-pointer">Глубокая оценка</Label>
          </div>
          <Button onClick={handleTechnicalPrep} disabled={!deepData || isTechnicalAnalyzing} className="mt-auto py-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/20 text-xs font-bold">
            {isTechnicalAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Zap className="w-3 h-3 mr-2" />}
            {isTechnicalAnalyzing ? 'Анализ...' : 'Запустить'}
          </Button>
        </div>

        {/* ШАГ 2: LLM */}
        <div className="bg-[#2a2a2a] border border-[#333] p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden group">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-5 h-5 text-[#4fc3f7]" />
            <h2 className="text-lg font-bold">2. ИИ-Отчет</h2>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[10px] text-blue-400 font-mono">
            Готово: {deepData?.filter(g => g.technicalAnalysis).length || 0}
          </div>
          <Button onClick={handleAiReport} disabled={!deepData || isAIAnalyzing} className="mt-auto py-4 rounded-xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 text-[#4fc3f7] hover:border-blue-500/50 text-xs font-bold">
            {isAIAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Sparkles className="w-3 h-3 mr-2" />}
            {isAIAnalyzing ? 'Пишу...' : 'Создать'}
          </Button>
        </div>

        {/* ШАГ 3: Studio */}
        <div className="bg-[#2a2a2a] border border-[#333] p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden group">
          <div className="flex items-center gap-3">
            <MessageSquareShare className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-bold">3. Студия</h2>
          </div>
          <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/10 text-[10px] text-green-400 font-mono">
            Экспорт в Lichess
          </div>
          <Button onClick={handleCreateStudio} disabled={!deepData || isCreatingStudio} className="mt-auto py-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 text-xs font-bold">
            {isCreatingStudio ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <MessageSquareShare className="w-3 h-3 mr-2" />}
            Отправить
          </Button>
        </div>
      </div>

      {studioUrl && (
        <div className="bg-green-500/5 border border-green-500/20 p-4 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3 text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold">Студия создана!</span>
          </div>
          <a href={studioUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-green-400 underline flex items-center gap-1">
            Открыть <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {aiReport && (
        <div className="bg-[#2a2a2a] border border-[#4fc3f7]/20 p-10 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-xs font-black text-[#4fc3f7] uppercase tracking-[0.2em] flex items-center gap-2">
              <BrainCircuit className="w-4 h-4" /> ИИ-Коучинг
            </h3>
            <span className="text-[10px] text-[#666]">{new Date().toLocaleString()}</span>
          </div>
          <div className="text-lg leading-relaxed text-[#e0e0e0]/90 whitespace-pre-wrap font-serif">
            {aiReport}
          </div>
        </div>
      )}

      {recommendedGames && recommendedGames.length > 0 && (
        <div className="bg-[#1a1a1a] border border-yellow-500/20 p-8 rounded-3xl animate-in fade-in duration-500">
          <h3 className="text-sm font-black text-yellow-500 uppercase tracking-wider mb-6 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Рекомендуемые партии к разбору
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {recommendedGames.map((game, i) => (
              <div key={i} className="bg-[#2a2a2a] p-4 rounded-2xl border border-[#333] flex justify-between items-center group hover:border-yellow-500/40 transition-all">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold">vs {game.is_white ? game.game_info.black : game.game_info.white}</span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-500">Интерес: {game.summary.interest_score.toFixed(1)}</span>
                  </div>
                </div>
                <a href={game.game_info.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl bg-[#1f1f1f] text-yellow-500 transition-all">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {savedAnalyses.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#888] flex items-center gap-2">
            <Clock className="w-4 h-4" /> Архив ИИ-Отчетов
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {savedAnalyses.map((analysis: any) => (
              <div key={analysis.id} className="bg-[#2a2a2a] border border-[#333] p-4 rounded-2xl hover:border-[#4fc3f7]/30 cursor-pointer transition-all group" onClick={() => setAiReport(analysis.report)}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Отчет от {new Date(analysis.created_at).toLocaleDateString()}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-bold">
                      {analysis.metadata?.game_count || 0} партий
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#666] group-hover:text-[#4fc3f7]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
