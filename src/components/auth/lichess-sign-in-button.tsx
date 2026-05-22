'use client';

import { Button } from '@/components/ui/button';
import { signInWithLichess } from '@/actions/auth';
import { useState } from 'react';

export const LichessSignInButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithLichess();
      
      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      console.error('Ошибка при входе через Lichess:', err);
      setError(err.message || 'Неизвестная ошибка');
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      disabled={isLoading}
      className="bg-[#4fc3f7] hover:bg-[#4fc3f7]/90 text-[#1f1f1f] font-bold py-6 px-8 rounded-md transition-all flex items-center gap-3 text-lg"
    >
      {isLoading ? (
        <div className="w-6 h-6 border-2 border-[#1f1f1f] border-t-transparent rounded-full animate-spin motion-reduce:animate-none" role="status" aria-label="Загрузка" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6 fill-current"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
        </svg>
      )}
      {error && (
        <div role="alert" aria-live="polite" className="w-full text-center text-red-400 text-sm font-medium mt-2">
          Ошибка: {error}
        </div>
      )}
      {isLoading ? 'Подключение...' : 'Войти через Lichess'}
    </Button>
  );
};
