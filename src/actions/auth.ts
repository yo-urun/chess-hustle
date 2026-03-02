'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { crypto } from 'node:crypto';

export async function signInWithLichess() {
  const cookieStore = await cookies();
  const headerList = await headers();
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing on server');
  }

  const host = headerList.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/auth/callback`;

  const codeVerifier = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const codeChallenge = Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const state = Math.random().toString(36).substring(2, 15);

  cookieStore.set('pkce_code_verifier', codeVerifier, { 
    httpOnly: true, 
    secure: protocol === 'https',
    path: '/',
    maxAge: 60 * 10 // 10 минут
  });
  
  cookieStore.set('pkce_state', state, { 
    httpOnly: true, 
    secure: protocol === 'https',
    path: '/',
    maxAge: 60 * 10
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID || 'chesscoachai',
    redirect_uri: redirectUri,
    scope: 'email:read board:play',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  console.log('Redirecting to Lichess with URI:', redirectUri);
  redirect(`https://lichess.org/oauth/authorize?${params.toString()}`);
}
