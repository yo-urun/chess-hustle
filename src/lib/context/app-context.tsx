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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [view, setView] = useState<'dashboard' | 'profile' | 'settings'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  // Загрузка учеников из Supabase
  useEffect(() => {
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
            newGames: 0, // Это значение будет вычисляться позже через Lichess API
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
  }, [supabase]);

  const addStudent = async (nickname: string) => {
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
