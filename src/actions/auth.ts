'use server';

import { createServerClient } from '@supabase/ssr';
import { createHash, randomBytes } from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function signInWithLichess() {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { error: `Конфигурация Supabase отсутствует на сервере. Проверьте Environment Variables в Vercel.` };
    }

    const host = headerList.get('x-forwarded-host') || headerList.get('host');
    const protocol = headerList.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const redirectUri = `${protocol}://${host}/auth/callback`;

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const state = Math.random().toString(36).substring(2, 15);

    cookieStore.set('pkce_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 10
    });
    
    cookieStore.set('pkce_state', state, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 10
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID || 'chesscoachai',
      redirect_uri: redirectUri,
      scope: 'email:read board:play studio:read studio:write msg:write',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return { url: `https://lichess.org/oauth/authorize?${params.toString()}` };
  } catch (err: any) {
    console.error('Ошибка в signInWithLichess:', err);
    return { error: err.message || 'Произошла внутренняя ошибка сервера' };
  }
}
