'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { LogOut, Settings as SettingsIcon, Users, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Dashboard } from '@/components/dashboard';
import { StudentProfile } from '@/components/student-profile';
import { Settings } from '@/components/settings';
import { useApp } from '@/lib/context/app-context';

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [supabase] = useState(() => createClient());
  const { view, setView, selectStudent, isDemoMode, setIsDemoMode } = useApp();

  useEffect(() => {
    if (isDemoMode) {
      setUser({ user_metadata: { username: 'Демо-Тренер' } });
      return;
    }
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase, isDemoMode]);

  const handleSignOut = async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      document.cookie = "chess_demo_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = '/login';
      return;
    }
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const renderContent = () => {
    switch (view) {
      case 'settings': return <Settings />;
      case 'profile': return <StudentProfile />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-[#1f1f1f] text-[#e0e0e0] flex flex-col">
      {/* Верхняя панель */}
      <header className="h-14 border-b border-white/5 bg-[#2a2a2a] flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                <Menu className="w-5 h-5" />
                <span className="sr-only">Открыть меню</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-[#1f1f1f] border-[#333] w-[280px]">
              <div className="flex flex-col gap-6 mt-8">
                <button 
                  onClick={() => selectStudent(null)}
                  className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity text-left"
                >
                  ChessCoach<span className="text-[#4fc3f7]">Ai</span>
                </button>
                <nav className="flex flex-col gap-2">
                  <SheetClose asChild>
                    <Button 
                      variant="ghost" 
                      onClick={() => selectStudent(null)}
                      className={`justify-start flex items-center gap-2 ${view === 'dashboard' || view === 'profile' ? 'text-[#4fc3f7] bg-[#4fc3f7]/10' : ''}`}
                    >
                      <Users className="w-4 h-4" />
                      Мои ученики
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button 
                      variant="ghost" 
                      onClick={() => setView('settings')}
                      className={`justify-start flex items-center gap-2 ${view === 'settings' ? 'text-[#4fc3f7] bg-[#4fc3f7]/10' : ''}`}
                    >
                      <SettingsIcon className="w-4 h-4" />
                      Настройки
                    </Button>
                  </SheetClose>
                </nav>
              </div>
            </SheetContent>
          </Sheet>
          <button 
            onClick={() => selectStudent(null)}
            className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity"
            aria-label="На главную"
          >
            ChessCoach<span className="text-[#4fc3f7]">Ai</span>
          </button>
          <nav className="hidden md:flex items-center gap-1 ml-8">
            <Button 
              variant="ghost" 
              onClick={() => selectStudent(null)}
              className={`flex items-center gap-2 ${view === 'dashboard' || view === 'profile' ? 'text-[#4fc3f7] bg-[#4fc3f7]/10' : ''}`}
            >
              <Users className="w-4 h-4" />
              Мои ученики
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setView('settings')}
              className={`flex items-center gap-2 ${view === 'settings' ? 'text-[#4fc3f7] bg-[#4fc3f7]/10' : ''}`}
            >
              <SettingsIcon className="w-4 h-4" />
              Настройки
            </Button>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end mr-2">
            <span className="text-[10px] text-[#4fc3f7] uppercase tracking-widest font-bold">Тренер</span>
            <span className="text-sm font-medium text-[#e0e0e0]/90">
              {user?.user_metadata?.username || user?.email?.split('@')[0].replace('lichess_', '') || '...'}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSignOut}
            aria-label="Выйти"
            className="h-9 w-9 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {renderContent()}
      </main>

      <footer className="py-8 px-6 border-t border-white/5 bg-[#1a1a1a] flex flex-col md:flex-row items-center justify-between gap-4 mt-auto">
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-[#444] uppercase">
          &copy; 2026 ChessCoach<span className="text-[#4fc3f7]/50">Ai</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#888]">Разработчик</span>
          <a 
            href="https://takethe.space" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e0e0e0] hover:text-[#4fc3f7] transition-all flex items-center gap-1.5 group border border-white/5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10"
          >
            takethe.space
            <span className="w-1.5 h-1.5 rounded-full bg-[#4fc3f7] motion-reduce:animate-none animate-pulse" />
          </a>
        </div>
      </footer>
    </div>
  );
}
