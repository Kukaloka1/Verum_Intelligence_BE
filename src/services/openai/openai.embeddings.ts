import { env } from "@/config/env";
import { getOpenAIClient } from "./openai.client";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

const DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS = 7000;
const OPENAI_EMBEDDING_TIMEOUT_MS =
  env.OPENAI_EMBEDDING_TIMEOUT_MS ?? DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS;
const OPENAI_EMBEDDING_TIMEOUT_RETRIES = env.OPENAI_EMBEDDING_TIMEOUT_RETRIES ?? 1;
const KNOWN_EMBEDDING_MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536
};

type EmbeddingDimensionSource = "env_override" | "known_model" | "unknown";

export interface EmbeddingModelDimensionInfo {
  model: string;
  expectedDimension: number | null;
  source: EmbeddingDimensionSource;
}

function getExpectedDimensionForModel(model: string): number | null {
  const override = env.OPENAI_EMBEDDING_DIMENSION;
  if (typeof override === "number" && Number.isInteger(override) && override > 0) {
    return override;
  }

  return KNOWN_EMBEDDING_MODEL_DIMENSIONS[model] ?? null;
}

export function getEmbeddingModelDimensionInfo(model: string): EmbeddingModelDimensionInfo {
  const expectedDimension = getExpectedDimensionForModel(model);
  if (typeof env.OPENAI_EMBEDDING_DIMENSION === "number") {
    return {
      model,
      expectedDimension,
      source: "env_override"
    };
  }

  if (KNOWN_EMBEDDING_MODEL_DIMENSIONS[model]) {
    return {
      model,
      expectedDimension,
      source: "known_model"
    };
  }

  return {
    model,
    expectedDimension,
    source: "unknown"
  };
}

export function getConfiguredEmbeddingModelInfo(): EmbeddingModelDimensionInfo {
  return getEmbeddingModelDimensionInfo(env.OPENAI_EMBEDDING_MODEL);
}

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
  const modelDimensionInfo = getEmbeddingModelDimensionInfo(client.embeddingModel);

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
    const vector = ensureEmbeddingVector(embedding);

    if (
      typeof modelDimensionInfo.expectedDimension === "number" &&
      vector.length !== modelDimensionInfo.expectedDimension
    ) {
      throw new Error(
        `Embedding dimension mismatch for configured model '${client.embeddingModel}'. Expected ${modelDimensionInfo.expectedDimension} (${modelDimensionInfo.source}), received ${vector.length}.`
      );
    }

    return vector;
  }

  if (lastTimeoutError) {
    throw lastTimeoutError;
  }

  throw new Error("OpenAI embeddings request failed before receiving a response.");
}
