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
  created_at: string;
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
