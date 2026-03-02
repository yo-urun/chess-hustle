'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function generateCoachingReport(studentNickname: string, gamesData: any[]) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Auth required');

  const { data: profile } = await supabase
    .from('profiles')
    .select('gemini_api_key, ollama_endpoint, ollama_api_key, ai_provider, ollama_model')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Error('Profile not found');

  const prompt = `
    Ты — элитный шахматный тренер. Твоя задача — проанализировать критические ошибки ученика ${studentNickname} на основе данных Stockfish.
    
    Для каждой ошибки тебе предоставлено:
    - Текстовое описание доски (Board State) перед ошибкой.
    - Список фигур (Pieces).
    - Ход, который был сделан (Played).
    - Лучший ход по мнению Stockfish (Best).
    - Принципиальный вариант продолжения (PV) для лучшего хода.
    
    ДАННЫЕ ПАРТИЙ:
    ${JSON.stringify(gamesData.map(g => ({
      opponent: g.opponent,
      result: g.result,
      blunders: g.blunders.map((b: any) => ({
        move: b.move,
        board: b.boardDescription,
        played: b.played,
        best: b.best,
        continuation: b.pv,
        loss: (b.diff/100).toFixed(1)
      }))
    })), null, 2)}

    ТВОЙ АНАЛИЗ (на русском языке):
    1. Идентифицируй типичные тактические или стратегические пробелы (связки, зевки, вилки и т.д.).
    2. Объясни ПРИЧИНУ 2-3 самых ярких ошибок. 
       ВАЖНО: Когда ты ссылаешься на конкретную позицию или ход, ОБЯЗАТЕЛЬНО используй формат: [описание](pos:FEN), чтобы пользователь мог кликнуть и увидеть доску.
       Пример: "Здесь ход [Кf3](pos:r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2) был бы лучше".
    3. Дай конкретный план тренировок.
    
    Пиши профессионально, кратко и по делу. Не используй FEN вне формата [текст](pos:FEN).
  `;

  if (profile.ai_provider === 'ollama') {
    const endpoint = profile.ollama_endpoint || "https://api.ollama.com/v1";
    // Определяем, какой API формат использовать (стандартный Ollama или OpenAI-совместимый /v1)
    const isOpenAIStyle = endpoint.includes('/v1');
    const url = isOpenAIStyle ? `${endpoint}/chat/completions` : `${endpoint}/api/generate`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (profile.ollama_api_key) {
      headers['Authorization'] = `Bearer ${profile.ollama_api_key}`;
    }

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
      const errorText = await response.text();
      throw new Error(`Ошибка API (${response.status}): ${errorText || response.statusText}`);
    }

    const result = await response.json();
    
    if (isOpenAIStyle) {
      return result.choices?.[0]?.message?.content || 'Ошибка OpenAI-совместимого API';
    }
    return result.response || 'Ошибка Ollama API';
  } else {
    // Gemini Direct Cloud
    const apiKey = profile.gemini_api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY не настроен');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Не удалось сгенерировать отчет';
  }
}
