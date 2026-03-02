'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getAccessToken() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // В Server Actions нельзя ставить куки, если ответ уже начал отправляться, 
            // но для getUser() это обычно не критично
          }
        }
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    console.error('getAccessToken: Пользователь не найден или ошибка сессии:', userError);
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('lichess_access_token')
    .eq('id', user.id)
    .single();
    
  if (profileError) {
    console.error('getAccessToken: Ошибка при чтении профиля из БД:', profileError);
    return null;
  }
    
  return profile?.lichess_access_token;
}

export async function getCloudEval(fen: string) {
  const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`;
  
  const response = await fetch(url);
  if (!response.ok) return null; // Оценки нет в базе

  const data = await response.json();
  return data.pvs?.[0]?.cp || data.pvs?.[0]?.mate * 10000 || 0;
}

export async function fetchUserGames(username: string, options: {
  max: number;
  perfType: string;
  color?: string;
  rated?: boolean;
}) {
  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    max: options.max.toString(),
    perfType: options.perfType,
    moves: 'true',
    accuracy: 'true',
    tags: 'true',
    clocks: 'true',
    evals: 'true', 
    opening: 'true',
    pgnInJson: 'true' // Получаем PGN для анализа
  });

  if (options.color && options.color !== 'both') {
    params.append('color', options.color);
  }

  const url = `https://lichess.org/api/games/user/${username}?${params.toString()}`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/x-ndjson',
      'Authorization': accessToken ? `Bearer ${accessToken}` : ''
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lichess API error: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const games = [];
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        games.push(JSON.parse(line));
      }
    }
  }

  return games;
}
