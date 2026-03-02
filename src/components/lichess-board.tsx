"use client"

import { useEffect, useRef } from "react"
import { Chessground } from "chessground"
import "chessground/assets/chessground.base.css"
import "chessground/assets/chessground.brown.css"

interface LichessBoardProps {
  fen: string
  orientation?: "white" | "black"
}

export function LichessBoard({ fen, orientation = "white" }: LichessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cgRef = useRef<any>(null)

  const initialFen = fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen;

  useEffect(() => {
    if (containerRef.current) {
      // Инициализация Chessground
      cgRef.current = Chessground(containerRef.current, {
        fen: initialFen,
        orientation: orientation,
        viewOnly: true,
        coordinates: true,
        animation: {
          enabled: true,
          duration: 250
        }
      })
    }

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy()
      }
    }
  }, [])

  // Синхронизация при изменении пропсов
  useEffect(() => {
    if (cgRef.current) {
      const currentPos = fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen;
      cgRef.current.set({
        fen: currentPos,
        orientation: orientation
      });
      
      // Принудительный перерасчет размеров
      setTimeout(() => {
        if (cgRef.current) cgRef.current.redrawAll();
      }, 30);
    }
  }, [fen, orientation])

  return (
    <div className="lichess-board-container w-full aspect-square relative shadow-2xl rounded-sm overflow-hidden border-4 border-[#1f1f1f]">
      <div 
        key={fen}
        ref={containerRef} 
        className="cg-wrap w-full h-full"
      />
      <style jsx global>{`
        .cg-wrap {
          width: 100%;
          height: 100%;
          position: relative;
          display: block;
        }
        /* Подгружаем фигуры прямо с серверов Lichess */
        .cg-wrap piece.pawn.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wP.svg'); }
        .cg-wrap piece.knight.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wN.svg'); }
        .cg-wrap piece.bishop.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wB.svg'); }
        .cg-wrap piece.rook.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wR.svg'); }
        .cg-wrap piece.queen.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wQ.svg'); }
        .cg-wrap piece.king.white { background-image: url('https://lichess1.org/assets/piece/cwhite/wK.svg'); }
        .cg-wrap piece.pawn.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bP.svg'); }
        .cg-wrap piece.knight.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bN.svg'); }
        .cg-wrap piece.bishop.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bB.svg'); }
        .cg-wrap piece.rook.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bR.svg'); }
        .cg-wrap piece.queen.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bQ.svg'); }
        .cg-wrap piece.king.black { background-image: url('https://lichess1.org/assets/piece/cwhite/bK.svg'); }
        
        .cg-wrap coords {
          color: #888;
          font-weight: bold;
          font-size: 12px;
        }
      `}</style>
    </div>
  )
}
