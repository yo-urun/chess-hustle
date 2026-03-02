'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function signInWithLichess() {
  const cookieStore = await cookies();
  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  
  // Важно: убираем лишние слеши и приводим к точному соответствию
  const redirectUri = `${protocol}://${host}/auth/callback`;
  
  console.log('--- AUTH DEBUG ---');
  console.log('Host:', host);
  console.log('Redirect URI:', redirectUri);
  console.log('------------------');

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
        },
      },
    }
  );

  // Генерация длинного code_verifier (минимум 43 символа)
  const codeVerifier = Array.from(crypto.getRandomValues(new Uint8Array(64)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  const codeChallenge = await crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(codeVerifier))
    .then((buf) =>
      btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
    );

  const state = crypto.randomUUID();

  cookieStore.set('pkce_code_verifier', codeVerifier, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === 'production',
  });
  cookieStore.set('pkce_state', state, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === 'production',
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID || 'chesscoachai',
    redirect_uri: redirectUri,
    scope: 'email:read board:play', // Добавили board:play для доступа к анализу
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  redirect(`https://lichess.org/oauth/authorize?${params.toString()}`);
}
