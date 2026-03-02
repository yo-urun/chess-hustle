'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { LogOut, Settings as SettingsIcon, Users } from 'lucide-react';
import { Dashboard } from '@/components/dashboard';
import { StudentProfile } from '@/components/student-profile';
import { Settings } from '@/components/settings';
import { useApp } from '@/lib/context/app-context';

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [supabase] = useState(() => createClient());
  const { view, setView, selectStudent } = useApp();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase]);

  const handleSignOut = async () => {
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
          <button 
            onClick={() => selectStudent(null)}
            className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity"
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
            title="Выйти"
            className="h-9 w-9 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {renderContent()}
      </main>
    </div>
  );
}
