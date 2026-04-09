import { env } from "@/config/env";
import { getOpenAIClient } from "./openai.client";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

const DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS = 7000;
const OPENAI_EMBEDDING_TIMEOUT_MS =
  env.OPENAI_EMBEDDING_TIMEOUT_MS ?? DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS;
const OPENAI_EMBEDDING_TIMEOUT_RETRIES = env.OPENAI_EMBEDDING_TIMEOUT_RETRIES ?? 1;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function ensureEmbeddingVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("OpenAI embedding response did not include a vector array.");
  }

  if (!value.every((item) => typeof item === "number")) {
    throw new Error("OpenAI embedding vector contains non-numeric entries.");
  }

  return value as number[];
}

export async function createEmbedding(input: string): Promise<number[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  let lastTimeoutError: Error | null = null;
  const maxAttempts = OPENAI_EMBEDDING_TIMEOUT_RETRIES + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_EMBEDDING_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${client.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: client.embeddingModel,
          input
        })
      });
    } catch (error) {
      if (isAbortError(error)) {
        lastTimeoutError = new Error(
          `OpenAI embeddings request timed out after ${OPENAI_EMBEDDING_TIMEOUT_MS}ms (attempt ${attempt}/${maxAttempts}).`
        );
        if (attempt < maxAttempts) {
          continue;
        }
        throw lastTimeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI embeddings request failed with status ${response.status}: ${body.slice(0, 220)}`
      );
    }

    const payload = (await response.json()) as OpenAIEmbeddingResponse;
    const embedding = payload.data?.[0]?.embedding;
    return ensureEmbeddingVector(embedding);
  }

  if (lastTimeoutError) {
    throw lastTimeoutError;
  }

  throw new Error("OpenAI embeddings request failed before receiving a response.");
}
