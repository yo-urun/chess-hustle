import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');

  const cookieStore = await cookies();
  const storedState = cookieStore.get('pkce_state')?.value;
  const codeVerifier = cookieStore.get('pkce_code_verifier')?.value;

  // Динамический redirect_uri на основе текущего запроса
  const redirectUri = new URL('/auth/callback', request.url).origin + '/auth/callback';

  if (!code || state !== storedState || !codeVerifier) {
    return new NextResponse(
      `Ошибка PKCE: Параметры не совпадают. Проверьте, что вы используете один и тот же браузер.`,
      { status: 400 }
    );
  }

  try {
    // ВАЖНО: URL для токена именно /api/token
    const tokenResponse = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID || 'chesscoachai',
        code_verifier: codeVerifier,
      }),
    });

    const responseText = await tokenResponse.text();
    let tokenData;
    
    try {
      tokenData = JSON.parse(responseText);
    } catch (e) {
      return new NextResponse(
        `Lichess вернул не JSON (возможно, ошибка порта или redirect_uri). 
        Ответ сервера: ${responseText.substring(0, 500)}`,
        { status: 500 }
      );
    }

    const { access_token, refresh_token } = tokenData;

    if (!access_token) {
      return new NextResponse(
        `Ошибка токена Lichess: ${JSON.stringify(tokenData)}`,
        { status: 401 }
      );
    }

    // --- ПОЛУЧЕНИЕ ПРОФИЛЯ LICHESS ---
    const accountResponse = await fetch('https://lichess.org/api/account', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    if (!accountResponse.ok) {
      return new NextResponse(`Ошибка получения профиля Lichess: ${await accountResponse.text()}`, { status: 500 });
    }
    
    const accountData = await accountResponse.json();
    const lichessId = accountData.id; // Например: 'georg_v'
    const lichessUsername = accountData.username;

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SERVICE_ROLE_SUPABASE_API_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet: any[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    // Используем Lichess ID для создания уникального email и пароля для Supabase Auth
    // Это позволяет пользователю всегда "входить" в один и тот же аккаунт
    const email = `lichess_${lichessId}@chesscoach.ai`;
    // Пароль на базе ID и анон-ключа (стабильно для проекта)
    const password = `LC_${lichessId}_${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10)}`;

    // Пробуем войти
    let { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Если пользователя нет — регистрируем
    if (authError) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            lichess_id: lichessId,
            username: lichessUsername,
          }
        }
      });
      
      if (signUpError) {
        return new NextResponse(`Ошибка регистрации Supabase: ${signUpError.message}`, { status: 500 });
      }
      user = signUpData.user;
    } else if (user) {
      // Если пользователь уже был, обновим его метаданные (на случай изменения ника)
      await supabase.auth.updateUser({
        data: { 
          lichess_id: lichessId,
          username: lichessUsername 
        }
      });
    }

    if (!user) {
      return new NextResponse(`Не удалось авторизовать пользователя`, { status: 500 });
    }

    // Сохраняем токены в профиль (используем только те колонки, которые точно есть)
    const profileData = {
      id: user.id,
      lichess_username: lichessUsername,
      lichess_access_token: access_token,
      lichess_refresh_token: refresh_token,
    };

    const { error: upsertError } = await supabase.from('profiles').upsert(profileData);

    if (upsertError) {
      console.error('--- DATABASE ERROR ---');
      console.error('Error upserting profile:', upsertError);
      console.error('User ID:', user.id);
      console.error('Data:', profileData);
      console.error('----------------------');
      // Возвращаем ошибку пользователю, чтобы он увидел её на экране
      return new NextResponse(`Ошибка БД при сохранении токена: ${upsertError.message} (Code: ${upsertError.code})`, { status: 500 });
    }

    console.log('--- AUTH SUCCESS ---');
    console.log('Profile updated for:', lichessUsername);
    console.log('--------------------');

    cookieStore.delete('pkce_code_verifier');
    cookieStore.delete('pkce_state');

    // Явный редирект на главную
    return NextResponse.redirect(new URL('/', request.url));
  } catch (err: any) {
    return new NextResponse(`Критическая ошибка: ${err.message}`, { status: 500 });
  }
}
