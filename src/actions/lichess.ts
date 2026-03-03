'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface LichessGame {
  id: string;
  createdAt: number;
  speed: string;
  perf: string;
  moves: string;
  pgn?: string;
  players: {
    white: { user: { id: string; name: string }; aiLevel?: number };
    black: { user: { id: string; name: string }; aiLevel?: number };
  };
  winner?: 'white' | 'black';
  opening?: { name: string };
  analysis?: { eval: number; best?: string; pv?: string }[];
}

async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {}
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('lichess_access_token')
    .eq('id', user.id)
    .single();
    
  return profile?.lichess_access_token || null;
}

export async function fetchUserGames(
  username: string, 
  options: { 
    max: number; 
    perfType?: string; 
    color?: 'white' | 'black';
    since?: number;
    until?: number;
  }
): Promise<LichessGame[]> {
  const token = await getAccessToken();
  
  const params = new URLSearchParams({
    max: options.max.toString(),
    moves: 'true',
    evals: 'true',
    opening: 'true',
    pgnInJson: 'true'
  });

  if (options.perfType && options.perfType !== 'all') params.append('perfType', options.perfType);
  if (options.color) params.append('color', options.color);
  if (options.since) params.append('since', options.since.toString());

  const response = await fetch(`https://lichess.org/api/games/user/${username}?${params.toString()}`, {
    headers: { 
      'Accept': 'application/x-ndjson', 
      'Authorization': token ? `Bearer ${token}` : '' 
    }
  });

  if (!response.ok) throw new Error(`Lichess Fetch Error: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader');

  const games: LichessGame[] = [];
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
        try {
          const g = JSON.parse(line);
          games.push(g);
        } catch (e) {}
      }
    }
  }
  return games;
}

export async function createLichessStudio(name: string): Promise<{ id: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('No token');
  const response = await fetch('https://lichess.org/api/study', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name })
  });
  return await response.json();
}

export async function importPgnToStudio(studioId: string, pgn: string, name: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('No token');
  await fetch(`https://lichess.org/api/study/${studioId}/import`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pgn, name })
  });
  return true;
}

export async function sendLichessMessage(username: string, text: string): Promise<boolean> {
  return true;
}
