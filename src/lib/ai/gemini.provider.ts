import { IAiProvider, AiProviderConfig, AiRequestOptions } from "./provider.interface";

export class GeminiProvider implements IAiProvider {
  name = 'Gemini';

  async generateResponse(prompt: string, config: AiProviderConfig, options?: AiRequestOptions): Promise<string> {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key is required');

    const model = config.model || 'gemini-2.0-flash';
    const temperature = options?.temperature ?? 0;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini Error (${response.status}): ${err}`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}
