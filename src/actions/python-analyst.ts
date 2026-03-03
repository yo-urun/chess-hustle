'use server';

import { headers } from 'next/headers';

export async function callPythonAnalyst(games: { pgn: string; evals?: any[] }[], username: string) {
  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  
  const response = await fetch(`${protocol}://${host}/api/analyst`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      games,
      username
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Python Analyst Error: ${err}`);
  }

  return await response.json();
}
