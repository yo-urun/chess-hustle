'use client';

import { LichessSignInButton } from '@/components/auth/lichess-sign-in-button';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="min-h-screen bg-[#1f1f1f]" />;
  }

  return (
    <div className="min-h-screen bg-[#1f1f1f] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#2a2a2a] p-8 rounded-xl shadow-2xl border border-white/5 flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <h1 
            className="text-3xl font-bold text-[#e0e0e0] tracking-tight"
            suppressHydrationWarning
          >
            ChessCoach<span className="text-[#4fc3f7]">Ai</span>
          </h1>
          <p className="text-[#e0e0e0]/60 text-center text-sm">
            Минималистичный сервис для анализа партий ваших учеников
          </p>
        </div>

        <div className="w-full flex flex-col gap-4">
          <LichessSignInButton />
          <p className="text-[#e0e0e0]/40 text-center text-xs px-4">
            Авторизация происходит через официальный API Lichess. Мы получаем доступ только к вашим публичным данным и почте.
          </p>
        </div>
      </div>
    </div>
  );
}
