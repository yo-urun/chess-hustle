import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Во время билда (prerendering) переменных может не быть.
    // Возвращаем пустой клиент или бросаем ошибку только в рантайме.
    console.warn("Supabase credentials missing. This is expected during build time if not provided.");
  }

  return createBrowserClient(
    url || 'https://placeholder.supabase.co',
    key || 'placeholder'
  );
};
