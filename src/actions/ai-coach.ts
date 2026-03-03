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

  // Трансформация данных в "Вербальные Нарративы" (в стиле Chess Tutor)
  const tacticalHighlights = gamesData.map(g => {
    const stats = g.statistics || {};
    const map = g.analysis_map || {};
    const info = g.game_info || {};
    
    const keyMoments = Object.values(map).filter((m: any) => 
        m.severity === 'blunder' || 
        (m.tactics && m.tactics.length > 0) ||
        (m.missed_tactics && m.missed_tactics.length > 0)
    ).map((m: any) => {
        return `Ход ${m.move_number} (${m.san}): Оценка ${m.eval.toFixed(1)}. 
        ${m.tactics?.length ? `Темы: ${m.tactics.join(', ')}.` : ''} 
        ${m.missed_tactics?.length ? `Упущено: ${m.missed_tactics.join(', ')}.` : ''}
        ${m.severity === 'blunder' ? 'Критическая ошибка!' : ''}`;
    });

    return {
      game: `${info.White} vs ${info.Black}`,
      url: info.Site || `https://lichess.org/${g.game_id}`,
      summary: `Зевков: ${stats.blunders}, Жертв: ${stats.brilliant_moves}, Упущено тактик: ${stats.missed_tactics}`,
      highlights: keyMoments.slice(0, 5) // Берем топ-5 самых важных моментов партии
    };
  });

  const prompt = `
    ТЫ — АКТИВНЫЙ ШАХМАТНЫЙ ТЬЮТОР. Твоя цель — не просто перечислить ошибки, а ОБЪЯСНИТЬ концепции ученику ${studentNickname}.
    
    ТВОЙ СТИЛЬ:
    - Профессиональный, но вдохновляющий (как в курсах Chess.com или Chessable).
    - ТЕМПЕРАТУРА = 0 (строго по фактам).
    - Каждое утверждение должно опираться на ДАННЫЕ АНАЛИЗА.

    ИНСТРУКЦИИ:
    1. ИСПОЛЬЗУЙ ССЫЛКИ: Когда говоришь о партии, давай её URL.
    2. ОБЪЯСНЯЙ "ПОЧЕМУ": Если в данных есть "trappedPiece", объясни, что фигура оказалась в ловушке из-за отсутствия полей. Если "discoveredCheck" — опиши опасность вскрытого нападения.
    3. РАЗБИРАЙ УПУЩЕННОЕ: Если ученик пропустил вилку (missed_tactics: fork), укажи на это как на зону роста.
    4. ФОРМАТ: Чистый текст, разделенный абзацами. НИКАКИХ символов #, ##, ***.

    ДАННЫЕ ДЛЯ АНАЛИЗА:
    ${JSON.stringify(tacticalHighlights, null, 2)}
    
    СТРУКТУРА:
    - Приветствие и краткий итог по всем партиям.
    - Глубокий разбор 2-3 самых поучительных моментов (с цитированием ходов и ссылками).
    - Психологический портрет (например: "ты склонен пропускать удары на конях" или "ты отлично жертвуешь материал").
    - Конкретное домашнее задание.
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
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Не удалось сформировать отчет';
  }
}
