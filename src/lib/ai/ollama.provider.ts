import { IAiProvider, AiProviderConfig, AiRequestOptions } from "./provider.interface";

export class OllamaProvider implements IAiProvider {
  name = 'Ollama';

  async generateResponse(prompt: string, config: AiProviderConfig, options?: AiRequestOptions): Promise<string> {
    const endpoint = config.endpoint || "http://localhost:11434";
    const isOpenAIStyle = endpoint.includes('/v1');
    const url = isOpenAIStyle ? `${endpoint}/chat/completions` : `${endpoint}/api/generate`;
    const model = config.model || "gemini-3-flash-preview";
    const temperature = options?.temperature ?? 0;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const body = isOpenAIStyle ? {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature
    } : {
      model,
      prompt,
      stream: false,
      options: { temperature }
    };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama Error (${response.status}): ${err}`);
    }

    const result = await response.json();
    return isOpenAIStyle ? result.choices?.[0]?.message?.content : result.response;
  }
}
