"use client"

import { useEffect, useRef } from "react"
import { Chessground } from "chessground"

// Базовые стили библиотеки
import "chessground/assets/chessground.base.css"
import "chessground/assets/chessground.brown.css"
import "chessground/assets/chessground.cwhite.css"

interface LichessBoardProps {
  fen: string
  orientation?: "white" | "black"
}

export function LichessBoard({ fen, orientation = "white" }: LichessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cgRef = useRef<any>(null)

  // Первичная инициализация
  useEffect(() => {
    if (containerRef.current && !cgRef.current) {
      cgRef.current = Chessground(containerRef.current, {
        fen: fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen,
        orientation: orientation,
        viewOnly: true,
        coordinates: true,
        animation: {
          enabled: true,
          duration: 300
        },
        premovable: { enabled: false },
        drawable: { enabled: true }
      })
    }

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy()
        cgRef.current = null
      }
    }
  }, [])

  // Обновление при изменении FEN или ориентации
  useEffect(() => {
    if (cgRef.current) {
      cgRef.current.set({
        fen: fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen,
        orientation: orientation
      })
      
      // Даем браузеру время на отрисовку и пересчитываем размеры
      requestAnimationFrame(() => {
        if (cgRef.current) cgRef.current.redrawAll()
      })
    }
  }, [fen, orientation])

  return (
    <div className="lichess-board-wrapper w-full aspect-square bg-[#2a2a2a] rounded-sm shadow-2xl">
      <div 
        ref={containerRef} 
        className="cg-wrap"
        style={{ width: '100%', height: '100%' }}
      />
      <style jsx global>{`
        .cg-wrap {
          width: 100%;
          height: 100%;
          display: block;
          position: relative;
        }
        
        /* ГАРАНТИРОВАННОЕ ПОДКЛЮЧЕНИЕ ФИГУР (Lichess Assets) */
        .cg-wrap piece {
          background-size: cover;
          background-repeat: no-repeat;
          width: 100%;
          height: 100%;
        }

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

        .cg-wrap coords {
          color: #888;
          font-weight: bold;
          font-size: 12px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  )
}
