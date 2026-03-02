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
import { saveAnalysis, getStudentAnalyses, SavedAnalysis } from "@/actions/analysis-db"
import { generateCoachingReport } from "@/actions/ai-coach"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [deepData, setDeepData] = useState<any[] | null>(null)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  
  // Filter states
  const [perfType, setPerfType] = useState<string>("blitz")
  const [maxGames, setMaxGames] = useState<number>(20)
  const [color, setColor] = useState<"white" | "black" | "all">("all")
  const [isDeepAnalysis, setIsDeepAnalysis] = useState(false)
  
  // Studio states
  const [isCreatingStudio, setIsCreatingStudio] = useState(false)
  const [studioUrl, setStudioUrl] = useState<string | null>(null)

  useEffect(() => {
    if (selectedStudent) {
      loadSavedAnalyses();
    }
  }, [selectedStudent]);

  const loadSavedAnalyses = async () => {
    if (!selectedStudent?.id) return;
    const data = await getStudentAnalyses(selectedStudent.id);
    setSavedAnalyses(data);
  };

  if (!selectedStudent) return null

  const handleDeepCollect = async (isNewGames: boolean = false) => {
    setIsCollecting(true);
    try {
      const options: any = {
        max: maxGames,
        perfType: perfType,
      };
      
      if (color !== "all") {
        options.color = color;
      }

      const data = await collectStudentData(selectedStudent.nickname, options);
      setDeepData(data);
    } catch (error) {
      alert('Ошибка при сборе истории.');
    } finally {
      setIsCollecting(false);
    }
  };

  const handlePythonAnalysis = async () => {
    if (!deepData || !selectedStudent?.id || !selectedStudent?.nickname) return;
    setIsAIAnalyzing(true);
    try {
      // Собираем PGN всех партий для анализа
      const pgns = deepData.map(g => g.pgn).filter(Boolean);
      
      // Вызываем Python-аналитика (теперь только для расчетов)
      const result = await callPythonAnalyst(pgns, selectedStudent.nickname, isDeepAnalysis);
      
      // Генерируем отчет через Ollama/Gemini Cloud (как настроено в профиле)
      // Передаем true для использования промпта под 9 параметров
      const report = await generateCoachingReport(selectedStudent.nickname, result.analyses, true);
      setAiReport(report);

      // Сохраняем в базу данных
      await saveAnalysis({
        student_id: selectedStudent.id,
        pgn: pgns.join('\n\n'),
        analysis_data: result.analyses,
        report: report,
        analysis_type: isDeepAnalysis ? 'deep' : 'surface'
      });

      loadSavedAnalyses();
    } catch (error: any) {
      alert(error.message || 'Ошибка при работе Python-аналитика.');
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleCreateStudio = async () => {
    if (!deepData) return;
    setIsCreatingStudio(true);
    try {
      const studioName = `Разбор для ${selectedStudent.nickname} (${new Date().toLocaleDateString()})`;
      const { id: studioId } = await createLichessStudio(studioName);
      const url = `https://lichess.org/study/${studioId}`;

      for (const game of deepData) {
        let annotatedPgn = game.pgn;
        if (game.blunders.length > 0) {
          annotatedPgn += ` { Найдено ошибок: ${game.blunders.length} }`;
        }
        await importPgnToStudio(studioId, annotatedPgn, `vs ${game.opponent}`);
      }

      const message = `Привет! Я подготовил для тебя обучающую студию с разбором твоих последних ошибок: ${url}`;
      await sendLichessMessage(selectedStudent.nickname, message);

      setStudioUrl(url);
      alert('Студия создана и ссылка отправлена ученику!');
    } catch (error: any) {
      console.error('[handleCreateStudio] Error:', error);
      const errorMessage = error.message || 'Неизвестная ошибка при создании студии';
      alert('Ошибка при создании студии: ' + errorMessage + '\n\nПроверьте консоль сервера для деталей.');
    } finally {
      setIsCreatingStudio(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 flex flex-col gap-8 text-[#e0e0e0]">
      {/* Навигация */}
      <div className="flex items-center justify-between">
        <button onClick={() => selectStudent(null)} className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#e0e0e0] transition-colors group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Назад к списку
        </button>
        <a href={`https://lichess.org/@/${selectedStudent.nickname}`} target="_blank" className="text-xs text-[#4fc3f7] hover:underline flex items-center gap-1">
          Lichess Профиль <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-6 bg-[#2a2a2a] p-8 rounded-3xl border border-[#333]">
        <div className="flex items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#4fc3f7]/10 text-[#4fc3f7] text-3xl font-bold border border-[#4fc3f7]/20 shadow-inner">
            {selectedStudent.nickname.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-black tracking-tight">{selectedStudent.nickname}</h1>
            <p className="text-[#666] mt-1 font-medium italic">Подготовка персонализированного обучения...</p>
          </div>
        </div>

        {/* Фильтры */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
          <div className="space-y-2">
            <Label className="text-xs text-[#888] uppercase tracking-wider">Контроль времени</Label>
            <RadioGroup value={perfType} onValueChange={setPerfType} className="flex gap-2">
              {['bullet', 'blitz', 'rapid'].map((t) => (
                <div key={t} className="flex items-center space-x-2">
                  <RadioGroupItem value={t} id={t} className="sr-only" />
                  <Label
                    htmlFor={t}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      perfType === t ? 'bg-[#4fc3f7] text-black' : 'bg-[#1f1f1f] text-[#888] hover:text-[#e0e0e0]'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-[#888] uppercase tracking-wider">Цвет фигур</Label>
            <RadioGroup value={color} onValueChange={(v: any) => setColor(v)} className="flex gap-2">
              {['all', 'white', 'black'].map((c) => (
                <div key={c} className="flex items-center space-x-2">
                  <RadioGroupItem value={c} id={`color-${c}`} className="sr-only" />
                  <Label
                    htmlFor={`color-${c}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      color === c ? 'bg-[#4fc3f7] text-black' : 'bg-[#1f1f1f] text-[#888] hover:text-[#e0e0e0]'
                    }`}
                  >
                    {c === 'all' ? 'Все' : c === 'white' ? 'Белые' : 'Черные'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-[#888] uppercase tracking-wider">Количество партий</Label>
            <div className="flex items-center gap-2">
              <Input 
                type="number" 
                value={maxGames} 
                onChange={(e) => setMaxGames(parseInt(e.target.value))}
                className="h-8 w-20 bg-[#1f1f1f] border-[#333] text-xs"
                min={1}
                max={50}
              />
              <span className="text-[10px] text-[#666]">(макс. 50)</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button
            onClick={() => handleDeepCollect(false)}
            disabled={isCollecting}
            className="flex-1 h-12 rounded-xl bg-[#4fc3f7] text-black hover:bg-[#4fc3f7]/90 font-bold"
          >
            {isCollecting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Database className="w-5 h-5 mr-2" />}
            Загрузить партии
          </Button>
          
          <Button
            onClick={() => handleDeepCollect(true)}
            disabled={isCollecting || !deepData}
            variant="outline"
            className="h-12 px-6 rounded-xl border-[#333] hover:bg-white/5 text-[#888]"
            title="Новые партии"
          >
            <History className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Карточка Python Анализа */}
        <div className="bg-[#2a2a2a] border border-[#333] p-8 rounded-3xl flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-[#4fc3f7]" />
            <h2 className="text-xl font-bold">Python Аналитик (9 параметров)</h2>
          </div>
          <p className="text-sm text-[#888] leading-relaxed">
            Анализ по 9 шахматным параметрам (материал, пространство, безопасность короля и др.) с использованием LLM.
          </p>
          
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1f1f1f] border border-[#333]">
            <input
              type="checkbox"
              id="deep-analysis-toggle"
              checked={isDeepAnalysis}
              onChange={(e) => setIsDeepAnalysis(e.target.checked)}
              className="w-4 h-4 rounded border-white/10 bg-white/5 text-[#4fc3f7] focus:ring-[#4fc3f7]"
            />
            <Label htmlFor="deep-analysis-toggle" className="text-xs text-[#888] cursor-pointer hover:text-[#e0e0e0] flex-1">
              Глубокий анализ (Lichess Cloud Eval)
            </Label>
          </div>

          <button
            onClick={handlePythonAnalysis}
            disabled={!deepData || isAIAnalyzing}
            className={`mt-auto flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all disabled:opacity-30 ${
              isDeepAnalysis
                ? 'bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 text-purple-400 hover:border-purple-500/50'
                : 'bg-[#1f1f1f] border border-[#333] hover:border-[#4fc3f7] text-[#e0e0e0]'
            }`}
          >
            {isAIAnalyzing ? <Loader2 className="w-4 h-4 animate-spin text-[#4fc3f7]" /> : <Sparkles className="w-4 h-4 text-[#4fc3f7]" />}
            {isAIAnalyzing ? 'Анализирую...' : isDeepAnalysis ? 'Запустить Глубокий Анализ' : 'Запустить Поверхностный Анализ'}
          </button>
        </div>

        {/* Карточка Студии */}
        <div className="bg-[#2a2a2a] border border-[#333] p-8 rounded-3xl flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <MessageSquareShare className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-bold">Lichess Студия</h2>
          </div>
          <p className="text-sm text-[#888] leading-relaxed">
            Создать интерактивный учебник на Lichess и отправить ссылку ученику в личку.
          </p>
          <button
            onClick={handleCreateStudio}
            disabled={!deepData || isCreatingStudio}
            className="mt-auto flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 py-4 rounded-2xl text-sm font-bold transition-all disabled:opacity-30"
          >
            {isCreatingStudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareShare className="w-4 h-4" />}
            {isCreatingStudio ? 'Создаю...' : 'Создать и отправить'}
          </button>
        </div>
      </div>

      {/* Результат Анализа */}
      {aiReport && (
        <div className="bg-[#2a2a2a] border border-[#4fc3f7]/20 p-10 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h3 className="text-xs font-black text-[#4fc3f7] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4" /> Отчет Python-Аналитика
          </h3>
          <div className="text-lg leading-relaxed text-[#e0e0e0]/90 whitespace-pre-wrap font-serif">
            {aiReport}
          </div>
        </div>
      )}

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
