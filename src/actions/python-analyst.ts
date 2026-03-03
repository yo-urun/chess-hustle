'use server';

import { headers } from 'next/headers';

export async function callPythonAnalyst(games: { pgn: string; evals?: any[] }[], username: string) {
  try {
    const headerList = await headers();
    const host = headerList.get('host');
    
    if (!host) {
      throw new Error('Could not determine host from headers');
    }

    const protocol = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https';
    const url = `${protocol}://${host}/api/analyst`;
    
    console.log(`[callPythonAnalyst] Calling ${url} for ${username}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        games,
        username
      }),
      // Set a reasonable timeout for large batches
      next: { revalidate: 0 } 
    } as any);

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}`;
      try {
        const errText = await response.text();
        // If it's a large HTML error page (common in production 500s), truncate it
        errorMessage = `Python Analyst Error (${response.status}): ${errText.slice(0, 200)}${errText.length > 200 ? '...' : ''}`;
      } catch (e) {
        console.error('[callPythonAnalyst] Could not read error response text', e);
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON response from Python Analyst, but got ${contentType}. Body: ${text.slice(0, 100)}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[callPythonAnalyst] Error:', error);
    throw error;
  }
}
