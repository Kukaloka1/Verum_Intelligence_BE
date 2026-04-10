import { env } from "@/config/env";
import { logError, logInfo, logWarn } from "@/utils/logger";
import { getOpenAIClient } from "./openai.client";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

const DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS = 7000;
const OPENAI_EMBEDDING_TIMEOUT_MS =
  env.OPENAI_EMBEDDING_TIMEOUT_MS ?? DEFAULT_OPENAI_EMBEDDING_TIMEOUT_MS;

const OPENAI_EMBEDDING_TIMEOUT_RETRIES = env.OPENAI_EMBEDDING_TIMEOUT_RETRIES ?? 1;

const DEFAULT_OPENAI_EMBEDDING_SLOW_MS = 2500;
const OPENAI_EMBEDDING_SLOW_MS =
  env.OPENAI_EMBEDDING_SLOW_MS ?? DEFAULT_OPENAI_EMBEDDING_SLOW_MS;

const KNOWN_EMBEDDING_MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536
};

type EmbeddingDimensionSource = "env_override" | "known_model" | "unknown";

const HAS_EMBEDDING_DIMENSION_OVERRIDE =
  typeof process.env.OPENAI_EMBEDDING_DIMENSION === "string" &&
  process.env.OPENAI_EMBEDDING_DIMENSION.trim().length > 0;

export interface EmbeddingModelDimensionInfo {
  model: string;
  expectedDimension: number | null;
  source: EmbeddingDimensionSource;
}

export type EmbeddingFailureType =
  | "provider_unavailable"
  | "empty_input"
  | "timeout"
  | "provider_error"
  | "invalid_payload"
  | "dimension_mismatch";

export interface EmbeddingCreateSuccessResult {
  ok: true;
  vector: number[];
  model: string;
  expectedDimension: number | null;
  actualDimension: number;
  attempts: number;
  durationMs: number;
}

export interface EmbeddingCreateFailureResult {
  ok: false;
  failure: EmbeddingFailureType;
  reason: string;
  model: string | null;
  expectedDimension: number | null;
  actualDimension: number | null;
  attempts: number;
  durationMs: number;
}

export type EmbeddingCreateResult =
  | EmbeddingCreateSuccessResult
  | EmbeddingCreateFailureResult;

function getExpectedDimensionForModel(model: string): number | null {
  if (HAS_EMBEDDING_DIMENSION_OVERRIDE) {
    const override = env.OPENAI_EMBEDDING_DIMENSION;
    if (typeof override === "number" && Number.isInteger(override) && override > 0) {
      return override;
    }
  }

  return KNOWN_EMBEDDING_MODEL_DIMENSIONS[model] ?? null;
}

export function getEmbeddingModelDimensionInfo(model: string): EmbeddingModelDimensionInfo {
  const expectedDimension = getExpectedDimensionForModel(model);

  if (HAS_EMBEDDING_DIMENSION_OVERRIDE) {
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

  if (value.length === 0) {
    throw new Error("OpenAI embedding response returned an empty vector.");
  }

  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error("OpenAI embedding vector contains non-numeric entries.");
  }

  return value as number[];
}

function normalizeEmbeddingInput(input: string): string {
  return input.trim();
}

function buildFailureResult(params: {
  failure: EmbeddingFailureType;
  reason: string;
  model: string | null;
  expectedDimension: number | null;
  actualDimension?: number | null;
  attempts: number;
  startedAt: number;
}): EmbeddingCreateFailureResult {
  return {
    ok: false,
    failure: params.failure,
    reason: params.reason,
    model: params.model,
    expectedDimension: params.expectedDimension,
    actualDimension: params.actualDimension ?? null,
    attempts: params.attempts,
    durationMs: Date.now() - params.startedAt
  };
}

function logEmbeddingFailure(result: EmbeddingCreateFailureResult): void {
  const payload = {
    failure: result.failure,
    reason: result.reason,
    model: result.model,
    expectedDimension: result.expectedDimension,
    actualDimension: result.actualDimension,
    attempts: result.attempts,
    durationMs: result.durationMs
  };

  if (result.failure === "timeout" || result.failure === "dimension_mismatch") {
    logWarn("OpenAI embedding request degraded", payload);
    return;
  }

  logError("OpenAI embedding request failed", payload);
}

function logEmbeddingSuccess(result: EmbeddingCreateSuccessResult, inputLength: number): void {
  const payload = {
    model: result.model,
    expectedDimension: result.expectedDimension,
    actualDimension: result.actualDimension,
    attempts: result.attempts,
    durationMs: result.durationMs,
    inputLength
  };

  if (result.durationMs >= OPENAI_EMBEDDING_SLOW_MS || result.attempts > 1) {
    logWarn("OpenAI embedding request slow_or_retried", payload);
    return;
  }

  logInfo("OpenAI embedding request completed", payload);
}

export async function createEmbeddingDetailed(input: string): Promise<EmbeddingCreateResult> {
  const startedAt = Date.now();
  const normalizedInput = normalizeEmbeddingInput(input);

  if (normalizedInput.length === 0) {
    const result = buildFailureResult({
      failure: "empty_input",
      reason: "Embedding input is empty after trim.",
      model: env.OPENAI_EMBEDDING_MODEL ?? null,
      expectedDimension: getConfiguredEmbeddingModelInfo().expectedDimension,
      attempts: 0,
      startedAt
    });
    logEmbeddingFailure(result);
    return result;
  }

  const client = getOpenAIClient();
  if (!client) {
    const result = buildFailureResult({
      failure: "provider_unavailable",
      reason: "OPENAI_API_KEY is not configured for embeddings.",
      model: null,
      expectedDimension: null,
      attempts: 0,
      startedAt
    });
    logEmbeddingFailure(result);
    return result;
  }

  const modelDimensionInfo = getEmbeddingModelDimensionInfo(client.embeddingModel);
  const maxAttempts = OPENAI_EMBEDDING_TIMEOUT_RETRIES + 1;
  let lastFailure: EmbeddingCreateFailureResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_EMBEDDING_TIMEOUT_MS);

    try {
      const response = await fetch(`${client.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: client.embeddingModel,
          input: normalizedInput
        })
      });

      if (!response.ok) {
        const body = await response.text();
        const result = buildFailureResult({
          failure: "provider_error",
          reason: `OpenAI embeddings request failed with status ${response.status}: ${body.slice(0, 220)}`,
          model: client.embeddingModel,
          expectedDimension: modelDimensionInfo.expectedDimension,
          attempts: attempt,
          startedAt
        });
        logEmbeddingFailure(result);
        return result;
      }

      const payload = (await response.json()) as OpenAIEmbeddingResponse;
      const embedding = payload.data?.[0]?.embedding;
      const vector = ensureEmbeddingVector(embedding);

      if (
        typeof modelDimensionInfo.expectedDimension === "number" &&
        vector.length !== modelDimensionInfo.expectedDimension
      ) {
        const result = buildFailureResult({
          failure: "dimension_mismatch",
          reason: `Embedding dimension mismatch for configured model '${client.embeddingModel}'. Expected ${modelDimensionInfo.expectedDimension} (${modelDimensionInfo.source}), received ${vector.length}.`,
          model: client.embeddingModel,
          expectedDimension: modelDimensionInfo.expectedDimension,
          actualDimension: vector.length,
          attempts: attempt,
          startedAt
        });
        logEmbeddingFailure(result);
        return result;
      }

      const success: EmbeddingCreateSuccessResult = {
        ok: true,
        vector,
        model: client.embeddingModel,
        expectedDimension: modelDimensionInfo.expectedDimension,
        actualDimension: vector.length,
        attempts: attempt,
        durationMs: Date.now() - startedAt
      };

      logEmbeddingSuccess(success, normalizedInput.length);
      return success;
    } catch (error) {
      if (isAbortError(error)) {
        lastFailure = buildFailureResult({
          failure: "timeout",
          reason: `OpenAI embeddings request timed out after ${OPENAI_EMBEDDING_TIMEOUT_MS}ms (attempt ${attempt}/${maxAttempts}).`,
          model: client.embeddingModel,
          expectedDimension: modelDimensionInfo.expectedDimension,
          attempts: attempt,
          startedAt
        });

        if (attempt < maxAttempts) {
          continue;
        }

        logEmbeddingFailure(lastFailure);
        return lastFailure;
      }

      const message =
        error instanceof Error ? error.message : "Unknown embeddings provider error.";
      const isInvalidPayload =
        message.includes("did not include a vector array") ||
        message.includes("empty vector") ||
        message.includes("non-numeric entries");

      const result = buildFailureResult({
        failure: isInvalidPayload ? "invalid_payload" : "provider_error",
        reason: message,
        model: client.embeddingModel,
        expectedDimension: modelDimensionInfo.expectedDimension,
        attempts: attempt,
        startedAt
      });

      logEmbeddingFailure(result);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  const fallbackFailure =
    lastFailure ??
    buildFailureResult({
      failure: "provider_error",
      reason: "OpenAI embeddings request failed before receiving a response.",
      model: client.embeddingModel,
      expectedDimension: modelDimensionInfo.expectedDimension,
      attempts: maxAttempts,
      startedAt
    });

  logEmbeddingFailure(fallbackFailure);
  return fallbackFailure;
}

export async function createEmbedding(input: string): Promise<number[] | null> {
  const result = await createEmbeddingDetailed(input);
  if (!result.ok) {
    return null;
  }

  return result.vector;
}
