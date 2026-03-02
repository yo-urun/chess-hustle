# ChessHustle AI ♟️🤖

Минималистичный сервис для шахматных тренеров, который анализирует партии учеников с помощью Stockfish и Gemini-3 (или Ollama).

## Возможности
- **Авторизация через Lichess (OAuth2 PKCE)**: Безопасный вход без пароля.
- **Интеграция с Supabase**: Постоянное хранение списка учеников и настроек тренера.
- **Data Mining**: Сбор истории до 50 партий ученика одним кликом.
- **Авто-детектор зевков**: Поиск критических ошибок на основе оценок Lichess Cloud Eval.
- **ИИ-Стратег (Gemini-3 / Ollama)**: Генерация персонализированного плана тренировок на основе реальных ошибок.
- **Интерактивная доска (Chessground)**: Кликабельные варианты в отчете ИИ мгновенно отображаются на доске (как на Lichess).

## Технический стек
- **Next.js 16 (Turbopack)**
- **React 19 (React Compiler)**
- **Tailwind CSS v4**
- **Supabase SSR**
- **Chessground** (движок доски Lichess)
- **Gemini-3 Flash Preview** (через Google API или Ollama Cloud)

## Настройка

### 1. База данных (Supabase)
Выполните следующие SQL-запросы в консоли Supabase:

```sql
-- Таблица профилей
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lichess_username TEXT,
  lichess_access_token TEXT,
  lichess_refresh_token TEXT,
  ai_provider TEXT DEFAULT 'ollama',
  ollama_model TEXT DEFAULT 'gemini-3-flash-preview',
  ollama_endpoint TEXT DEFAULT 'https://api.ollama.com/v1',
  ollama_api_key TEXT,
  gemini_api_key TEXT
);

-- Таблица учеников
CREATE TABLE IF NOT EXISTS public.students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nickname TEXT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, nickname)
);

-- Не забудьте настроить RLS политики!
```

### 2. Переменные окружения (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=ваш_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_ключ
NEXT_PUBLIC_LICHESS_CLIENT_ID=ваш_id
# Опционально (если хотите дефолтный ключ на сервере)
GEMINI_API_KEY=ваш_ключ
```

### 3. Запуск
```bash
npm install
npm run dev
```

## Лицензия
MIT
