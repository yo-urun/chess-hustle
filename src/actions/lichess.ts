'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface LichessGame {
  id: string;
  createdAt: number;
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
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch (e) {
          // Ignore cookie errors during SSR/Server Actions
        }
      },
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

export async function createLichessStudio(name: string): Promise<{ id: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Token missing');

  const response = await fetch('https://lichess.org/api/studio', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/x-www-form-urlencoded' 
    },
    body: new URLSearchParams({ name })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Studio Error: ${err}`);
  }
  
  return await response.json();
}

export async function importPgnToStudio(studioId: string, pgn: string, name: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('Token missing');

  const response = await fetch(`https://lichess.org/api/studio/${studioId}/import`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/x-www-form-urlencoded' 
    },
    body: new URLSearchParams({ pgn, name })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Import Error: ${err}`);
  }
  
  return true;
}

export async function sendLichessMessage(username: string, text: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('Token missing');

  const response = await fetch(`https://lichess.org/api/msg/${username}`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/x-www-form-urlencoded' 
    },
    body: new URLSearchParams({ text })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Message Error: ${err}`);
  }
  
  return true;
}

export async function fetchUserGames(username: string, options: { max: number; perfType: string }): Promise<LichessGame[]> {
  const token = await getAccessToken();
  
  const params = new URLSearchParams({
    max: options.max.toString(),
    perfType: options.perfType,
    moves: 'true',
    evals: 'true',
    opening: 'true',
    pgnInJson: 'true'
  });

  const response = await fetch(`https://lichess.org/api/games/user/${username}?${params.toString()}`, {
    headers: { 
      'Accept': 'application/x-ndjson', 
      'Authorization': token ? `Bearer ${token}` : '' 
    }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Fetch Games Error: ${err}`);
  }

  const reader = response.body?.getReader();
  const games: LichessGame[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  if (!reader) throw new Error('No reader available');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          games.push(JSON.parse(line));
        } catch (e) {
          console.error("Error parsing game line:", e);
        }
      }
    }
  }

  return games;
}

export async function getCloudEval(fen: string): Promise<number | null> {
  const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`;
  const response = await fetch(url);
  
  if (!response.ok) return null;
  
  const data = await response.json();
  const pv = data.pvs?.[0];
  if (!pv) return 0;
  
  return pv.cp !== undefined ? pv.cp : (pv.mate * 10000);
}
