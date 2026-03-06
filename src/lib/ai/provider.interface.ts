export interface AiProviderConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

export interface AiRequestOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface IAiProvider {
  generateResponse(prompt: string, config: AiProviderConfig, options?: AiRequestOptions): Promise<string>;
  name: string;
}
