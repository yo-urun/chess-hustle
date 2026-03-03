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

  // Очищаем данные для промпта, чтобы уменьшить токены и дать ИИ ссылки
  const minimalGamesData = gamesData.map(g => ({
    id: g.game_id,
    url: g.game_info?.url || `https://lichess.org/${g.game_id}`,
    white: g.game_info?.white,
    black: g.game_info?.black,
    result: g.game_info?.result,
    summary: g.summary,
    eval_history: g.eval_history
  }));

  const prompt = `
    Ты — элитный шахматный тренер. Твоя задача — составить профессиональный отчет для ученика ${studentNickname}.
    
    ИНСТРУКЦИИ ПО ФОРМАТУ:
    1. НЕ используй Markdown заголовки (символы #, ##, ###).
    2. НЕ используй жирный текст (**текст**) и курсив (*текст*). 
    3. Вывод должен быть чистым текстом, разделенным на абзацы.
    4. Когда ты ссылаешься на конкретную партию, ОБЯЗАТЕЛЬНО пиши её полную ссылку в формате (например: https://lichess.org/ABCDEFGH).
    5. Используй формат [ход](pos:FEN) только если хочешь показать конкретную позицию на доске.
    6. Пиши на русском языке, вдохновляюще и по делу.

    ДАННЫЕ ПАРТИЙ:
    ${JSON.stringify(minimalGamesData, null, 2)}
    
    СТРУКТУРА ОТЧЕТА:
    - Общий обзор игры ученика за текущий период.
    - Анализ сильных сторон.
    - Разбор ключевых ошибок с указанием конкретных партий (и их ссылок).
    - Конкретные рекомендации и план работы.
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
    
    if (!response.ok) {
      if (response.status === 401) throw new Error('Ошибка 401: Неверный API ключ для AI провайдера');
      const errorText = await response.text();
      throw new Error(`AI API Error (${response.status}): ${errorText || response.statusText}`);
    }

    const result = await response.json();
    return isOpenAIStyle ? result.choices?.[0]?.message?.content : result.response;
  } else {
    // Gemini Direct Cloud
    const apiKey = profile.gemini_api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('API ключ Gemini не настроен.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini Error: ${err.error?.message || 'Ошибка API'}`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Не удалось сгенерировать отчет';
  }
}
