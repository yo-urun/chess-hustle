'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { CoachingService } from '@/lib/services/coaching.service';
import { AnalysisData } from '@/lib/models/analysis.model';

export async function generateCoachingReport(studentNickname: string, gamesData: AnalysisData[], isPythonAnalysis: boolean = false) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пожалуйста, войдите в систему');

  const { data: profile } = await supabase
    .from('profiles')
    .select('gemini_api_key, ollama_endpoint, ollama_api_key, ai_provider, ollama_model')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Error('Профиль тренера не найден');

  const service = new CoachingService();
  
  return await service.generateReport(studentNickname, gamesData, {
    provider: profile.ai_provider || 'gemini',
    apiKey: profile.gemini_api_key || process.env.GEMINI_API_KEY,
    endpoint: profile.ollama_endpoint,
    model: profile.ollama_model
  });
}
