import { IAiProvider } from "../ai/provider.interface";
import { GeminiProvider } from "../ai/gemini.provider";
import { OllamaProvider } from "../ai/ollama.provider";
import { TechnicalAnalysis, AnalysisData } from "../models/analysis.model";

export class CoachingService {
  private providers: Record<string, IAiProvider> = {
    'gemini': new GeminiProvider(),
    'ollama': new OllamaProvider()
  };

  public async generateReport(
    studentNickname: string,
    gamesData: AnalysisData[],
    config: {
      provider: string;
      apiKey?: string;
      endpoint?: string;
      model?: string;
    }
  ): Promise<string> {
    const provider = this.providers[config.provider] || this.providers['gemini'];
    
    // Превращаем сырые данные в богатые модели
    const analyses = gamesData.map(d => new TechnicalAnalysis(d));
    const tacticalHighlights = analyses.map(a => a.toJSON());

    const prompt = this.buildPrompt(studentNickname, tacticalHighlights);
    
    const response = await provider.generateResponse(
      prompt, 
      { apiKey: config.apiKey, endpoint: config.endpoint, model: config.model },
      { temperature: 0 }
    );

    return this.cleanResponse(response);
  }

  private buildPrompt(studentNickname: string, highlights: any[]): string {
    return `
      ТЫ — ГРОССМЕЙСТЕР И ПРОФЕССИОНАЛЬНЫЙ ШАХМАТНЫЙ ТРЕНЕР (Elo 2800). 
      Твоя цель — провести глубокий анализ партий ученика по имени ${studentNickname} и поднять его уровень игры до 2200 Elo.

      КОНТЕКСТ АНАЛИЗА:
      Для каждой критической позиции тебе предоставлены:
      - FEN: точное состояние доски.
      - LEGAL MOVES: список всех разрешенных ходов (используй это, чтобы не предлагать невозможные ходы).
      - EVALUATION: оценка движка Stockfish.
      - ENGINE BEST MOVE: лучший ход по мнению компьютера.

      ТВОЙ АЛГОРИТМ МЫШЛЕНИЯ (Chain-of-Thought):
      1. Визуализируй позицию по FEN.
      2. Оцени безопасность короля и активность фигур обеих сторон.
      3. Сравни ход ученика с лучшим ходом движка. Пойми ЧЕЛОВЕЧЕСКУЮ причину ошибки (страх, невнимательность, незнание паттерна).
      4. Сформулируй совет, который поможет ученику больше не совершать такую ошибку.

      ПРАВИЛА ОФОРМЛЕНИЯ:
      - СТИЛЬ: Вдохновляющий, экспертный, четкий.
      - ЗАПРЕТЫ: НИКАКИХ символов # или *. НИКАКОГО жирного текста. Только чистый текст и ссылки.
      - ССЫЛКИ: Обязательно давай ссылки на партии в формате [Название](URL).

      ДАННЫЕ ДЛЯ РАЗБОРА (JSON):
      ${JSON.stringify(highlights, null, 2)}
      
      СТРУКТУРА ОТЧЕТА:
      1. Общий вердикт по стилю игры ученика.
      2. Разбор 2-3 самых поучительных позиций. Указывай номер хода и ссылку на партию. Объясняй идеи, используя данные FEN и легальных ходов.
      3. "Золотое правило" для ученика на следующую неделю.
      4. Конкретное домашнее задание.
    `;
  }

  private cleanResponse(text: string): string {
    return text.replace(/(?<!\[[^\]]*)[#*]/g, '').trim();
  }
}
