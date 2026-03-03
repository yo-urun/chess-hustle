'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function generateCoachingReport(studentNickname: string, gamesData: any[], isPythonAnalysis: boolean = false) {
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

  // Формируем ОЧЕНЬ СТРУКТУРИРОВАННЫЕ данные для ИИ
  const technicalSummary = gamesData.map(g => {
    const info = g.game_info || {};
    const stats = g.summary || {};
    const evals = g.eval_history || [];
    
    return {
      game_id: g.game_id,
      lichess_url: `https://lichess.org/${g.game_id}`,
      opponent: info.white === studentNickname ? info.black : info.white,
      result: info.result,
      is_student_white: info.white === studentNickname,
      stockfish_blunders_count: stats.blunders || 0,
      interest_score: stats.interest_score || 0,
      evaluation_swings: evals.map((e: any) => `Move ${e.move}: ${e.eval.toFixed(1)}`).join(', ')
    };
  });

  const prompt = `
    ТЫ — ЭЛИТНЫЙ ШАХМАТНЫЙ ТРЕНЕР. ТВОЯ ЗАДАЧА — АНАЛИЗ ПАРТИЙ УЧЕНИКА ${studentNickname}.
    
    ОСНОВНОЕ ПРАВИЛО: Твой анализ ДОЛЖЕН СТРОГО ОПИРАТЬСЯ НА ДАННЫЕ STOCKFISH.
    Если Stockfish показывает резкое падение оценки (evaluation_swings), ты ОБЯЗАН найти причину и указать на эту партию по ссылке.
    
    ИНСТРУКЦИИ ПО ФОРМАТУ:
    - НЕ ИСПОЛЬЗУЙ Markdown (никаких #, ##, ###, **, *). 
    - Разделяй текст только пустой строкой между абзацами.
    - Обязательно давай прямые ссылки на партии Lichess в формате https://lichess.org/ID.
    - Пиши на русском языке, профессионально и жестко по делу.

    ТЕХНИЧЕСКИЕ ДАННЫЕ ПАРТИЙ (ОТ STOCKFISH):
    ${JSON.stringify(technicalSummary, null, 2)}
    
    СТРУКТУРА:
    1. Общий вердикт по игре ученика за период.
    2. Разбор критических ошибок (ссылайся на конкретные партии и их URL).
    3. Почему Stockfish зафиксировал зевки? (Тактика, позиционный провал и т.д.).
    4. Рекомендации по обучению.
  `;

  if (profile.ai_provider === 'ollama') {
    const endpoint = profile.ollama_endpoint || "http://localhost:11434";
    const isOpenAIStyle = endpoint.includes('/v1');
    const url = isOpenAIStyle ? `${endpoint}/chat/completions` : `${endpoint}/api/generate`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (profile.ollama_api_key) headers['Authorization'] = `Bearer ${profile.ollama_api_key}`;

    const body = isOpenAIStyle ? {
      model: profile.ollama_model || "gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }]
    } : {
      model: profile.ollama_model || "gemini-3-flash-preview",
      prompt: prompt,
      stream: false
    };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`AI API Error (${response.status})`);
    const result = await response.json();
    return isOpenAIStyle ? result.choices?.[0]?.message?.content : result.response;
  } else {
    // Gemini Cloud
    const apiKey = profile.gemini_api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key missing');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Ошибка генерации отчета';
  }
}
