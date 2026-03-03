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

  // Трансформация данных для LLM
  // Мы берем сырой JSON от Python и превращаем его в читабельную сводку для LLM
  const tacticalSummary = gamesData.map(g => {
    // g - это PythonAnalysisResult
    const stats = g.statistics || {};
    const map = g.analysis_map || {};
    const info = g.game_info || {};
    
    // Извлекаем только ключевые моменты
    const moments = Object.values(map).filter((m: any) => 
        m.severity === 'blunder' || 
        m.opportunity === 'missed_win' || 
        (m.tactics && m.tactics.length > 0) ||
        m.tactic_type === 'sacrifice'
    ).map((m: any) => {
        return `Move ${m.move_number} (${m.color}): ${m.san}. Eval: ${m.eval}. 
        ${m.tactics ? `Tactics: ${m.tactics.join(', ')}.` : ''} 
        ${m.severity ? `Error: ${m.severity}.` : ''} 
        ${m.opportunity ? `Missed: ${m.opportunity}.` : ''}
        ${m.tactic_type === 'sacrifice' ? 'Sacrifice detected.' : ''}`;
    });

    return {
      game: `${info.White} vs ${info.Black}`,
      result: info.Result,
      url: info.Site || info.url,
      stats: stats,
      key_moments: moments
    };
  });

  const prompt = `
    ТЫ — ЭЛИТНЫЙ ШАХМАТНЫЙ ТРЕНЕР. ТВОЯ ЗАДАЧА — СУХОЙ И ПРАВДИВЫЙ ОТЧЕТ ПО ПАРТИЯМ УЧЕНИКА ${studentNickname}.
    
    ИСТОЧНИК ИСТИНЫ: ДАННЫЕ STOCKFISH И PYTHON-CHESS.
    Я даю тебе список партий с уже выявленными тактическими ошибками (fork, pin) и упущенными победами.
    Твоя задача — не "искать" ошибки (они уже найдены), а ОБЪЯСНИТЬ их и дать ссылку.

    ЖЕСТКИЕ ПРАВИЛА:
    1. ТЕМПЕРАТУРА АНАЛИЗА = 0.
    2. Если в данных написано "Fork detected", ты должен сказать: "На N ходу пропущена вилка".
    3. Если "Missed Win", ты должен сказать: "Упущена победа".
    4. ОБЯЗАТЕЛЬНО давай ссылки на партии.
    5. Используй шахматную терминологию (связка, рентген, цугцванг), если она есть в данных (pin, x-ray).

    ДАННЫЕ АНАЛИЗА:
    ${JSON.stringify(tacticalSummary, null, 2)}
    
    СТРУКТУРА ОТЧЕТА:
    1. Статистика (сколько зевков, сколько тактики).
    2. Разбор конкретных ошибок. Цитируй ходы, объясняй тактические мотивы (например: перегрузка, отвлечение, завлечение, вилка, связка, сквозной удар, рентген, упущенная тактика) и давай ссылки.
    3. Рекомендация (например: "Решать задачи на тему 'отвлечение'").
  `;

  if (profile.ai_provider === 'ollama') {
    const endpoint = profile.ollama_endpoint || "http://localhost:11434";
    const isOpenAIStyle = endpoint.includes('/v1');
    const url = isOpenAIStyle ? `${endpoint}/chat/completions` : `${endpoint}/api/generate`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (profile.ollama_api_key) headers['Authorization'] = `Bearer ${profile.ollama_api_key}`;

    const body = isOpenAIStyle ? {
      model: profile.ollama_model || "gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      temperature: 0 
    } : {
      model: profile.ollama_model || "gemini-3-flash-preview",
      prompt: prompt,
      stream: false,
      options: { temperature: 0 }
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
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 } 
      })
    });

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Ошибка генерации отчета';
  }
}
