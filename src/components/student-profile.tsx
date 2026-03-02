"use client"

import { useState, useMemo } from "react"
import { useApp } from "@/lib/context/app-context"
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Sparkles,
  Loader2,
  Info,
  Database,
  BrainCircuit,
  Puzzle,
} from "lucide-react"
import { fetchUserGames, getCloudEval } from "@/actions/lichess"
import { collectStudentData } from "@/actions/analysis"
import { generateCoachingReport } from "@/actions/ai-coach"
import { Chess } from 'chess.js'
import { LichessBoard } from "@/components/lichess-board"

export function StudentProfile() {
  const { selectedStudent, selectStudent } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)
  const [deepData, setDeepData] = useState<any[] | null>(null)
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  
  // Позиция доски
  const [currentFen, setCurrentFen] = useState("start")

  if (!selectedStudent) return null

  // Функция для безопасной установки FEN
  const updateBoard = (fen: string) => {
    try {
      const cleanFen = fen.trim().replace(/^["']|["']$/g, '');
      if (cleanFen === "start") {
        setCurrentFen("start");
        return;
      }

      const chess = new Chess();
      // 1. Пытаемся загрузить как есть
      let loaded = false;
      try { 
        chess.load(cleanFen); 
        loaded = true;
      } catch(e) {}

      if (loaded) {
        setCurrentFen(cleanFen);
      } else {
        // 2. Если не вышло (битая рокировка или счетчики), берем только часть с доской
        const boardPart = cleanFen.split(' ')[0];
        const fallbackFen = `${boardPart} w - - 0 1`;
        
        try {
          chess.load(fallbackFen);
          console.warn("Using fallback FEN (only board part):", fallbackFen);
          setCurrentFen(fallbackFen);
        } catch(e) {
          // Если и это не помогло - передаем как есть
          setCurrentFen(cleanFen);
        }
      }
    } catch (e) {
      console.error("Critical error in updateBoard:", e);
    }
  }

  const handleDeepCollect = async () => {
    setIsCollecting(true);
    try {
      const data = await collectStudentData(selectedStudent.nickname, 50);
      setDeepData(data);
    } catch (error) {
      console.error(error);
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

  const formattedReport = useMemo(() => {
    if (!aiReport) return null;
    const parts = aiReport.split(/(\[.*?\]\(pos:[^)]+\))/g);
    return parts.map((part, index) => {
      const match = part.match(/\[(.*?)\]\(pos:(.*?)\)/);
      if (match) {
        const [, text, fen] = match;
        return (
          <button
            key={index}
            onClick={() => updateBoard(fen)}
            className="text-[#4fc3f7] font-bold border-b border-dashed border-[#4fc3f7] hover:bg-[#4fc3f7]/30 transition-all mx-0.5 px-1 rounded bg-[#4fc3f7]/5 inline-flex items-center"
          >
            {text}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  }, [aiReport]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-10 flex flex-col gap-8 text-[#e0e0e0]">
      {/* Навигация */}
      <div className="flex flex-col gap-4">
        <button onClick={() => selectStudent(null)} className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#e0e0e0] transition-colors w-fit group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Назад к списку
        </button>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4fc3f7]/15 text-[#4fc3f7] text-lg font-bold border border-[#4fc3f7]/20">
            {selectedStudent.nickname.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold">{selectedStudent.nickname}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
        {/* ЛЕВО: Доска Lichess (Сделана Sticky) */}
        <div className="lg:col-span-5 lg:sticky lg:top-10 flex flex-col gap-4 self-start">
          <div className="bg-[#2a2a2a] border border-[#333] p-5 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h3 className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Lichess Board</h3>
              </div>
              <button 
                onClick={() => updateBoard("start")} 
                className="text-[10px] font-bold text-[#4fc3f7] hover:bg-[#4fc3f7]/10 px-2 py-1 rounded transition-colors"
              >
                СБРОС
              </button>
            </div>
            
            {/* Сама доска Chessground */}
            <div className="w-full max-w-[480px] mx-auto overflow-hidden rounded shadow-xl">
              <LichessBoard fen={currentFen} orientation="white" />
            </div>
            
            <div className="mt-6 p-3 bg-[#1f1f1f] rounded-lg border border-[#333]">
              <p className="text-[9px] text-[#444] font-mono mb-1 uppercase font-bold">FEN</p>
              <p className="text-[10px] text-[#666] font-mono break-all leading-tight">{currentFen === "start" ? "Начальная позиция" : currentFen}</p>
            </div>
          </div>

          {deepData && (
            <div className="bg-[#4fc3f7]/5 border border-[#4fc3f7]/20 p-4 rounded-xl flex items-center gap-3">
              <Puzzle className="w-4 h-4 text-[#4fc3f7]" />
              <p className="text-xs text-[#888] font-medium">{deepData.reduce((acc, g) => acc + (g.blunders?.length || 0), 0)} позиций для разбора</p>
            </div>
          )}
        </div>

        {/* ПРАВО: Анализ и Отчеты */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="bg-[#2a2a2a] border border-[#333] p-8 rounded-2xl shadow-sm min-h-[500px]">
            <div className="flex items-center justify-between mb-10 pb-6 border-b border-[#333]">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <BrainCircuit className="w-6 h-6 text-[#4fc3f7]" />
                Анализ Gemini-3
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={handleDeepCollect}
                  disabled={isCollecting}
                  className="p-2.5 rounded-xl bg-[#1f1f1f] border border-[#333] hover:border-[#4fc3f7]/50 transition-all disabled:opacity-50"
                >
                  {isCollecting ? <Loader2 className="w-5 h-5 animate-spin text-[#4fc3f7]" /> : <Database className="w-5 h-5 text-[#888]" />}
                </button>
                <button
                  onClick={handleAIReport}
                  disabled={!deepData || isAIAnalyzing}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#4fc3f7] hover:bg-[#4fc3f7]/90 text-[#1f1f1f] font-bold text-sm transition-all disabled:opacity-50 shadow-lg shadow-[#4fc3f7]/10"
                >
                  {isAIAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Анализировать
                </button>
              </div>
            </div>

            {aiReport ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="text-[16px] leading-relaxed text-[#e0e0e0]/90 whitespace-pre-wrap font-sans">
                  {formattedReport}
                </div>
                <div className="mt-10 p-4 bg-[#1f1f1f]/50 rounded-xl border border-dashed border-[#333] flex items-start gap-3 text-[#666]">
                  <Info className="w-4 h-4 mt-0.5" />
                  <p className="text-xs leading-relaxed italic">
                    Нажимайте на подсвеченные ходы, чтобы позиция отобразилась на доске слева.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-[#333] rounded-2xl bg-[#1f1f1f]/30">
                <BrainCircuit className="w-12 h-12 text-[#1f1f1f] mb-6" />
                <h3 className="text-[#e0e0e0] font-bold mb-2">Отчет не сформирован</h3>
                <p className="text-[#666] text-sm max-w-xs mx-auto">
                  Соберите базу игр, а затем нажмите кнопку «Анализировать».
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
