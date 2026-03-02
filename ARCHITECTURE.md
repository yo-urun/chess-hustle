# Техническая архитектура ChessCoachAi

Данный документ описывает техническую реализацию проекта на текущий момент (март 2026).

## Стек технологий
- **Framework:** Next.js 16.1.6 (Canary/RC) с App Router.
- **Runtime:** React 19 (используется React Compiler для автоматической оптимизации).
- **Styling:** Tailwind CSS v4.0 (использование CSS-переменных для темы).
- **Database & Auth:** Supabase (PostgreSQL + Auth SSR).
- **Icons:** Lucide React.
- **UI Components:** Кастомные компоненты на базе Radix UI (из папки `v0design`).

## Структура проекта
- `/chess-coach-ai`: Основное приложение.
  - `/src/actions`: Server Actions для логики (Auth, Lichess API).
  - `/src/app`: Роуты приложения (Next.js App Router).
  - `/src/components`: UI-компоненты (shared и специфичные для доменов).
  - `/src/lib`: Утилиты, инициализация Supabase.
- `/v0design`: Дизайн-система и прототипы компонентов (в процессе переноса в основной проект).

## Реализация авторизации (Lichess OAuth2 PKCE)
Авторизация реализована вручную через протокол OAuth2 с использованием расширения PKCE (Proof Key for Code Exchange) для обеспечения максимальной безопасности.

1.  **Инициация (`/actions/auth.ts`):** Генерируется `code_verifier` и `code_challenge`. Данные сохраняются в `httpOnly` куки.
2.  **Callback (`/app/auth/callback/route.ts`):** 
    - Проверка `state` и `code_verifier`.
    - Обмен кода на `access_token` через `https://lichess.org/api/token`.
    - (Текущая реализация) Анонимный вход в Supabase и сохранение токенов в таблицу `profiles`.

## База данных (Supabase)
- Таблица `profiles`: Хранит токены Lichess и настройки тренера.
- Таблица `students` (планируется): Список учеников, привязанных к тренеру.

## Интеграция с Lichess
- Используется Personal Access Token (PAT) или OAuth Token для доступа к Cloud Eval API.
- Импорт партий через Lichess API (NDJSON формат).
