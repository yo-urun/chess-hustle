# Архитектура проекта ChessCoachAi

Проект следует принципам **Clean Architecture** и **SOLID**, разделяя ответственность на слои.

## Стек
- **Frontend:** Next.js 15 (App Router, Server Components)
- **Backend:** Next.js Server Actions + Python-аналитик (Vercel Functions)
- **DB & Auth:** Supabase (Postgres + OAuth Lichess)
- **Анализ:** Local Stockfish (WASM) + Lichess Cloud Eval

## Уровни системы

### 1. Слой данных (Supabase & API)
- Хранение профилей тренеров, учеников и результатов анализа.
- Прямая интеграция с Lichess API для импорта партий.

### 2. Слой моделей (Rich Domain Models)
- **TechnicalAnalysis**: Класс-модель, инкапсулирующий логику обработки данных анализа (формирование URL, выделение ключевых моментов).

### 3. Слой сервисов (Business Logic / Use Cases)
- **CoachingService**: Центральный узел бизнес-логики. Обрабатывает данные анализа и готовит данные для ИИ.
- **AiProvider (Strategy Pattern)**: Система провайдеров ИИ. Реализована через интерфейс `IAiProvider`, что позволяет переключаться между Gemini, Ollama или любым другим провайдером без изменения основного кода.

### 4. Слой представления (UI)
- React Server Components для эффективного рендеринга.
- Client Components для интерактивной части (анализ на Stockfish в браузере).

## Потоки данных
1. Загрузка партий через Lichess API.
2. Техническая подготовка (Stockfish в браузере).
3. Синхронизация и обогащение данных через Python-аналитик.
4. Генерация коучинг-отчета через `CoachingService` и выбранный `AiProvider`.
