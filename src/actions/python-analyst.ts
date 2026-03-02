'use server';

import { headers } from 'next/headers';

export async function callPythonAnalyst(pgns: string[], username: string, deep: boolean = false) {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host');
  const protocol = headerList.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
  
  // ВАЖНО: На Vercel NEXT_PUBLIC_APP_URL может быть не задан, используем host
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
  const apiUrl = `${baseUrl}/api/analyst`;

  console.log(`[callPythonAnalyst] Calling ${apiUrl} for ${username} (deep=${deep})`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pgns,
      username,
      deep
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Python Analyst Error: ${err}`);
  }

  return await response.json();
}
