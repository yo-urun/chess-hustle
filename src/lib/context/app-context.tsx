'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export interface Student {
  id?: string;
  nickname: string;
  addedAt: string;
  lastAnalysis?: string;
  newGames: number;
}

interface AppContextType {
  students: Student[];
  addStudent: (nickname: string) => Promise<void>;
  removeStudent: (nickname: string) => Promise<void>;
  selectStudent: (student: Student | null) => void;
  selectedStudent: Student | null;
  view: 'dashboard' | 'profile' | 'settings';
  setView: (view: 'dashboard' | 'profile' | 'settings') => void;
  isLoading: boolean;
  isDemoMode: boolean;
  setIsDemoMode: (val: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const MOCK_STUDENTS: Student[] = [
  { id: 'demo-1', nickname: 'Magnus_Junior', addedAt: new Date().toISOString(), lastAnalysis: '2026-03-01T12:00:00Z', newGames: 5 },
  { id: 'demo-2', nickname: 'Tactics_Machine', addedAt: new Date().toISOString(), lastAnalysis: '2026-02-28T15:30:00Z', newGames: 12 },
  { id: 'demo-3', nickname: 'Endgame_Master', addedAt: new Date().toISOString(), lastAnalysis: undefined, newGames: 3 },
  { id: 'demo-4', nickname: 'Aggressive_Pawn', addedAt: new Date().toISOString(), lastAnalysis: '2026-03-03T09:15:00Z', newGames: 0 }
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [view, setView] = useState<'dashboard' | 'profile' | 'settings'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [supabase] = useState(() => createClient());

  // Auto-detect demo mode from cookie
  useEffect(() => {
    const isDemo = document.cookie.includes('chess_demo_mode=true');
    if (isDemo) {
      setIsDemoMode(true);
      setStudents(MOCK_STUDENTS);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemoMode) return;

    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStudents([]);
          return;
        }

        const { data, error } = await supabase
          .from('students')
          .select('*')
          .order('added_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const formattedStudents: Student[] = data.map((s: any) => ({
            id: s.id,
            nickname: s.nickname,
            addedAt: s.added_at,
            lastAnalysis: s.last_analysis,
            newGames: 0,
          }));
          setStudents(formattedStudents);
        }
      } catch (error) {
        console.error('Ошибка при загрузке учеников:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [supabase, isDemoMode]);

  const addStudent = async (nickname: string) => {
    if (isDemoMode) {
      alert('В демо-режиме нельзя добавлять новых учеников.');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Пользователь не авторизован');

      const { data, error } = await supabase
        .from('students')
        .insert([{ 
          nickname, 
          coach_id: user.id 
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('Этот ученик уже добавлен!');
          return;
        }
        throw error;
      }

      if (data) {
        const newStudent: Student = {
          id: data.id,
          nickname: data.nickname,
          addedAt: data.added_at,
          newGames: 0,
        };
        setStudents((prev) => [newStudent, ...prev]);
      }
    } catch (error) {
      console.error('Ошибка при добавлении ученика:', error);
      alert('Не удалось добавить ученика. Попробуйте еще раз.');
    }
  };

  const removeStudent = async (nickname: string) => {
    if (isDemoMode) {
      setStudents(prev => prev.filter(s => s.nickname !== nickname));
      return;
    }
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('nickname', nickname);

      if (error) throw error;

      setStudents((prev) => prev.filter((s) => s.nickname !== nickname));
      if (selectedStudent?.nickname === nickname) {
        setSelectedStudent(null);
        setView('dashboard');
      }
    } catch (error) {
      console.error('Ошибка при удалении ученика:', error);
    }
  };

  const selectStudent = (student: Student | null) => {
    setSelectedStudent(student);
    setView(student ? 'profile' : 'dashboard');
  };

  const handleSetIsDemoMode = (val: boolean) => {
    setIsDemoMode(val);
    if (val) {
      document.cookie = "chess_demo_mode=true; path=/; max-age=3600";
      setStudents(MOCK_STUDENTS);
    } else {
      document.cookie = "chess_demo_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  };

  return (
    <AppContext.Provider
      value={{
        students,
        addStudent,
        removeStudent,
        selectStudent,
        selectedStudent,
        view,
        setView,
        isLoading,
        isDemoMode,
        setIsDemoMode: handleSetIsDemoMode
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
