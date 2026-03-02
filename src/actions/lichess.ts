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
          } catch {}
        }
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('lichess_access_token')
    .eq('id', user.id)
    .single();
    
  return profile?.lichess_access_token;
}

export async function createLichessStudio(name: string) {
  const token = await getAccessToken();
  const response = await fetch('https://lichess.org/api/studio', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name })
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json(); // Возвращает { id }
}

export async function importPgnToStudio(studioId: string, pgn: string, name: string) {
  const token = await getAccessToken();
  const response = await fetch(`https://lichess.org/api/studio/${studioId}/import`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pgn, name })
  });
  if (!response.ok) throw new Error(await response.text());
  return true;
}

export async function sendLichessMessage(username: string, text: string) {
  const token = await getAccessToken();
  const response = await fetch(`https://lichess.org/api/msg/${username}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text })
  });
  if (!response.ok) throw new Error(await response.text());
  return true;
}

export async function fetchUserGames(username: string, options: { max: number; perfType: string }) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    max: options.max.toString(),
    perfType: options.perfType,
    moves: 'true', evals: 'true', opening: 'true', pgnInJson: 'true'
  });
  const response = await fetch(`https://lichess.org/api/games/user/${username}?${params.toString()}`, {
    headers: { 'Accept': 'application/x-ndjson', 'Authorization': token ? `Bearer ${token}` : '' }
  });
  if (!response.ok) throw new Error(await response.text());
  const reader = response.body?.getReader();
  const games = [];
  const decoder = new TextDecoder();
  let buffer = '';
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) if (line.trim()) games.push(JSON.parse(line));
  }
  return games;
}

export async function getCloudEval(fen: string) {
  const response = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.pvs?.[0]?.cp || (data.pvs?.[0]?.mate * 10000) || 0;
}
