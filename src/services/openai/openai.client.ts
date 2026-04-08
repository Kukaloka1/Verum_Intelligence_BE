import { env } from "@/config/env";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export interface OpenAIClientConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export function getOpenAIClient(): OpenAIClientConfig | null {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return {
    apiKey: env.OPENAI_API_KEY,
    baseUrl: OPENAI_BASE_URL,
    chatModel: env.OPENAI_CHAT_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL
  };
}
