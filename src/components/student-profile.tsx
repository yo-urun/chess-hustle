"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { createLichessStudio, importPgnToStudio, sendLichessMessage } from "@/actions/lichess"
import { collectStudentData } from "@/actions/analysis"
import { generateCoachingReport } from "@/actions/ai-coach"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [deepData, setDeepData] = useState<any[] | null>(null)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  
  // Studio states
  const [isCreatingStudio, setIsCreatingStudio] = useState(false)
  const [studioUrl, setStudioUrl] = useState<string | null>(null)

  if (!selectedStudent) return null

  const handleDeepCollect = async () => {
    setIsCollecting(true);
    try {
      const data = await collectStudentData(selectedStudent.nickname, 20); // Для MVP берем 20 игр
      setDeepData(data);
    } catch (error) {
      alert('Ошибка при сборе истории.');
    } finally {
      setIsCollecting(false);
    }
  };

  const handleAIReport = async () => {
    if (!deepData) return;
    setIsAIAnalyzing(true);
    try {
      const report = await generateCoachingReport(selectedStudent.nickname, deepData);
      setAiReport(report);
    } catch (error: any) {
      alert(error.message || 'Ошибка при генерации отчета.');
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleCreateStudio = async () => {
    if (!deepData) return;
    setIsCreatingStudio(true);
    try {
      // 1. Создаем студию
      const studioName = `Разбор для ${selectedStudent.nickname} (${new Date().toLocaleDateString()})`;
      const { id: studioId } = await createLichessStudio(studioName);
      const url = `https://lichess.org/study/${studioId}`;

      // 2. Импортируем партии как главы
      for (const game of deepData) {
        // Формируем PGN с аннотациями
        let annotatedPgn = game.pgn;
        // Добавляем зевки как варианты (упрощенно для примера)
        if (game.blunders.length > 0) {
          annotatedPgn += ` { Найдено ошибок: ${game.blunders.length} }`;
        }

        await importPgnToStudio(studioId, annotatedPgn, `vs ${game.opponent}`);
      }

      // 3. Отправляем сообщение ученику
      const message = `Привет! Я подготовил для тебя обучающую студию с разбором твоих последних ошибок: ${url}`;
      await sendLichessMessage(selectedStudent.nickname, message);

      setStudioUrl(url);
      alert('Студия создана и ссылка отправлена ученику!');
    } catch (error: any) {
      console.error(error);
      alert('Ошибка при создании студии: ' + error.message);
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
      <div className="flex items-center gap-6 bg-[#2a2a2a] p-8 rounded-3xl border border-[#333]">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#4fc3f7]/10 text-[#4fc3f7] text-3xl font-bold border border-[#4fc3f7]/20 shadow-inner">
          {selectedStudent.nickname.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-4xl font-black tracking-tight">{selectedStudent.nickname}</h1>
          <p className="text-[#666] mt-1 font-medium italic">Подготовка персонализированного обучения...</p>
        </div>
        
        <div className="flex gap-2">
           <button
              onClick={handleDeepCollect}
              disabled={isCollecting}
              className="p-4 rounded-2xl bg-[#1f1f1f] border border-[#333] hover:border-[#4fc3f7]/50 transition-all disabled:opacity-50"
              title="Загрузить историю игр"
            >
              {isCollecting ? <Loader2 className="w-6 h-6 animate-spin text-[#4fc3f7]" /> : <Database className="w-6 h-6 text-[#888]" />}
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Карточка ИИ Анализа */}
        <div className="bg-[#2a2a2a] border border-[#333] p-8 rounded-3xl flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-[#4fc3f7]" />
            <h2 className="text-xl font-bold">ИИ-Стратегия</h2>
          </div>
          <p className="text-sm text-[#888] leading-relaxed">
            Нейросеть проанализирует собранные данные и выявит твои типичные ошибки и паттерны.
          </p>
          <button
            onClick={handleAIReport}
            disabled={!deepData || isAIAnalyzing}
            className="mt-auto flex items-center justify-center gap-2 bg-[#1f1f1f] border border-[#333] hover:border-[#4fc3f7] py-4 rounded-2xl text-sm font-bold transition-all disabled:opacity-30"
          >
            {isAIAnalyzing ? <Loader2 className="w-4 h-4 animate-spin text-[#4fc3f7]" /> : <Sparkles className="w-4 h-4 text-[#4fc3f7]" />}
            {isAIAnalyzing ? 'Думаю...' : 'Сгенерировать отчет'}
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
            <BrainCircuit className="w-4 h-4" /> Разбор от Тренера (Gemini-3)
          </h3>
          <div className="text-lg leading-relaxed text-[#e0e0e0]/90 whitespace-pre-wrap font-serif">
            {aiReport}
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
