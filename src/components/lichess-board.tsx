"use client"

import { useEffect, useRef } from "react"
import { Chessground } from "chessground"

// Мы НЕ импортируем CSS здесь, чтобы избежать проблем с путями на Vercel.
// Вместо этого мы внедрим его ниже через <style>.

interface LichessBoardProps {
  fen: string
  orientation?: "white" | "black"
}

export function LichessBoard({ fen, orientation = "white" }: LichessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cgRef = useRef<any>(null)

  useEffect(() => {
    if (containerRef.current && !cgRef.current) {
      // Инициализация
      cgRef.current = Chessground(containerRef.current, {
        fen: fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen,
        orientation: orientation,
        viewOnly: true,
        coordinates: true,
        animation: {
          enabled: true,
          duration: 300
        },
        draggable: { enabled: false }
      })
    }

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy()
        cgRef.current = null
      }
    }
  }, [])

  // Синхронизация FEN
  useEffect(() => {
    if (cgRef.current) {
      cgRef.current.set({
        fen: fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen,
        orientation: orientation
      })
      
      // Принудительная перерисовка
      setTimeout(() => {
        if (cgRef.current) cgRef.current.redrawAll()
      }, 50)
    }
  }, [fen, orientation])

  return (
    <div className="lichess-board-container w-full aspect-square relative shadow-2xl rounded-sm overflow-hidden">
      <div 
        ref={containerRef} 
        className="cg-wrap"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      
      {/* КРИТИЧЕСКИ ВАЖНЫЕ СТИЛИ LICHESS */}
      <style jsx global>{`
        /* Базовый скелет Chessground */
        .cg-wrap { position: relative; width: 100%; height: 100%; display: block; background-color: #2a2a2a; }
        .cg-wrap canvas { position: absolute; top: 0; left: 0; z-index: 2; pointer-events: none; }
        .cg-wrap .cg-board { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1; }
        
        /* Цвета доски Lichess (Brown theme) */
        .cg-wrap .cg-board {
          background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMiAyIj48cmVjdCB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSIjYmI1ZTIzIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2VkZDRiYSIvPjxyZWN0IHg9IjEiIHk9IjEiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNlZGQ0YmEiLz48L3N2Zz4=');
          background-size: 25% 25%; /* 8x8 squares */
        }

        .cg-wrap piece {
          position: absolute;
          width: 12.5%;
          height: 12.5%;
          background-size: cover;
          z-index: 2;
          will-change: transform;
        }

        /* Фигуры - Прямые ссылки на Lichess CDN */
        .cg-wrap piece.pawn.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wP.svg') !important; }
        .cg-wrap piece.knight.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wN.svg') !important; }
        .cg-wrap piece.bishop.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wB.svg') !important; }
        .cg-wrap piece.rook.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wR.svg') !important; }
        .cg-wrap piece.queen.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wQ.svg') !important; }
        .cg-wrap piece.king.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wK.svg') !important; }
        
        .cg-wrap piece.pawn.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bP.svg') !important; }
        .cg-wrap piece.knight.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bN.svg') !important; }
        .cg-wrap piece.bishop.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bB.svg') !important; }
        .cg-wrap piece.rook.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bR.svg') !important; }
        .cg-wrap piece.queen.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bQ.svg') !important; }
        .cg-wrap piece.king.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bK.svg') !important; }

        /* Координаты */
        .cg-wrap coords {
          position: absolute;
          display: flex;
          pointer-events: none;
          z-index: 1;
          font-family: sans-serif;
          font-weight: bold;
          font-size: 10px;
          color: #888;
        }
        .cg-wrap coords.ranks { right: 2px; top: 0; height: 100%; flex-direction: column; }
        .cg-wrap coords.ranks coord { flex: 1 1 auto; display: flex; align-items: center; }
        .cg-wrap coords.files { bottom: 2px; left: 0; width: 100%; flex-direction: row; }
        .cg-wrap coords.files coord { flex: 1 1 auto; padding-left: 2px; }
      `}</style>
    </div>
  )
}
