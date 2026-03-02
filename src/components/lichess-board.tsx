"use client"

import { useEffect, useRef } from "react"
import { Chessground } from "chessground"

interface LichessBoardProps {
  fen: string
  orientation?: "white" | "black"
}

export function LichessBoard({ fen, orientation = "white" }: LichessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cgRef = useRef<any>(null)

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
        }
      })
    }

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy()
        cgRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (cgRef.current) {
      cgRef.current.set({
        fen: fen === "start" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : fen,
        orientation: orientation
      })
      
      // Немедленная перерисовка для старых браузеров/медленного железа
      cgRef.current.redrawAll()
    }
  }, [fen, orientation])

  return (
    <div className="lichess-board-container w-full aspect-square relative shadow-2xl rounded-sm overflow-hidden bg-[#2a2a2a]">
      <div 
        ref={containerRef} 
        className="cg-wrap"
      />
    </div>
  )
}
