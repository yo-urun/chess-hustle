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
      ТЫ — АКТИВНЫЙ ШАХМАТНЫЙ ТЬЮТОР. Твоя цель — ОБЪЯСНИТЬ концепции ученику ${studentNickname}.
      
      СТИЛЬ:
      - Профессиональный, без лишних символов (#, *).
      - Только текст и Markdown ссылки [Описание](URL).

      ИНСТРУКЦИИ:
      1. ИСПОЛЬЗУЙ КЛИКАБЕЛЬНЫЕ ССЫЛКИ [Название партии](URL).
      2. ОБЪЯСНЯЙ шахматные идеи просто.
      3. НИКАКОГО форматирования через символы # или *.

      ДАННЫЕ ДЛЯ АНАЛИЗА:
      ${JSON.stringify(highlights, null, 2)}
      
      СТРУКТУРА:
      - Приветствие.
      - Глубокий разбор 2-3 моментов со ссылками.
      - Психологический портрет и задание.
    `;
  }

  private cleanResponse(text: string): string {
    return text.replace(/(?<!\[[^\]]*)[#*]/g, '').trim();
  }
}
