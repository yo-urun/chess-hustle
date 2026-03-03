'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface SavedAnalysis {
  id: string;
  student_id: string;
  coach_id: string;
  game_id?: string;
  pgn: string;
  analysis_data: any;
  report: string;
  analysis_type?: 'deep' | 'surface';
  created_at: string;
}

export interface GameRecord {
  id?: string;
  lichess_id: string;
  student_id: string;
  coach_id: string;
  pgn: string;
  metadata: any;
  created_at?: string;
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (e) {}
        },
      },
    }
  );
}

export async function saveAnalysis(data: {
  student_id: string;
  game_id?: string;
  pgn: string;
  analysis_data: any;
  report: string;
  analysis_type?: 'deep' | 'surface';
}) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: saved, error } = await supabase
    .from('analyses')
    .insert([{
      ...data,
      coach_id: user.id
    }])
    .select()
    .single();

  if (error) {
    console.error('[saveAnalysis] Error:', error);
    throw error;
  }

  return saved as SavedAnalysis;
}

export async function getStudentAnalyses(studentId: string) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getStudentAnalyses] Error:', error);
    return [];
  }

  return data as SavedAnalysis[];
}

export async function saveGamesBatch(games: Omit<GameRecord, 'id' | 'coach_id' | 'created_at'>[]) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const insertData = games.map(g => ({
    ...g,
    coach_id: user.id
  }));

  const { data, error } = await supabase
    .from('games')
    .upsert(insertData, { 
      onConflict: 'lichess_id,student_id',
      ignoreDuplicates: false 
    })
    .select();

  if (error) {
    console.error('[saveGamesBatch] Error:', error);
    throw error;
  }

  return data;
}

export async function getStudentGames(studentId: string) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getStudentGames] Error:', error);
    return [];
  }

  return data as GameRecord[];
}
