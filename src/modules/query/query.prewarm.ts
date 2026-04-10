import { env } from "@/config/env";
import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import { createEmbeddingDetailed } from "@/services/openai/openai.embeddings";
import { logInfo, logWarn } from "@/utils/logger";
import { prewarmJurisdictionLookupCache } from "./retrieval/build-retrieval-plan";

interface QueryPrewarmSummary {
  enabled: boolean;
  completed: boolean;
  durationMs: number;
  jurisdictionInputs: string[];
  jurisdictionWarmup: Array<{
    input: string;
    jurisdictionId: string | null;
    ok: boolean;
    reason: string;
  }>;
  corpusDimensionWarmup: Array<{
    jurisdictionId: string | null;
    ok: boolean;
    reason: string;
    sampledRows: number | null;
    detectedDimension: number | null;
  }>;
  embeddingProviderWarmup:
    | {
        enabled: false;
      }
    | {
        enabled: true;
        ok: boolean;
        reason: string;
        attempts: number;
        durationMs: number;
      };
}

function toDurationMs(startedAt: number): number {
  return Number((Date.now() - startedAt).toFixed(2));
}

function parseJurisdictionInputs(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function runQueryStartupPrewarm(): Promise<QueryPrewarmSummary> {
  const startedAt = Date.now();
  const timeoutMs = env.QUERY_PREWARM_TIMEOUT_MS;
  const jurisdictionInputs = parseJurisdictionInputs(env.QUERY_PREWARM_JURISDICTIONS);

  if (!env.QUERY_PREWARM_ENABLED) {
    const disabledSummary: QueryPrewarmSummary = {
      enabled: false,
      completed: false,
      durationMs: toDurationMs(startedAt),
      jurisdictionInputs,
      jurisdictionWarmup: [],
      corpusDimensionWarmup: [],
      embeddingProviderWarmup: { enabled: false }
    };
    logInfo("Module 1 query prewarm skipped (disabled).", {
      enabled: false,
      jurisdictionInputs
    });
    return disabledSummary;
  }

  try {
    const jurisdictionWarmup = await withTimeout(
      prewarmJurisdictionLookupCache(jurisdictionInputs),
      timeoutMs,
      "jurisdiction cache prewarm"
    );

    const resolvedJurisdictionIds = Array.from(
      new Set(
        jurisdictionWarmup
          .filter((entry) => entry.ok && typeof entry.jurisdictionId === "string")
          .map((entry) => entry.jurisdictionId as string)
      )
    );

    const corpusDimensionWarmup = await withTimeout(
      queryRetrievalRepository.prewarmCorpusEmbeddingDimensionCache([null, ...resolvedJurisdictionIds]),
      timeoutMs,
      "corpus embedding dimension prewarm"
    );

    const embeddingProviderWarmup: QueryPrewarmSummary["embeddingProviderWarmup"] =
      env.QUERY_PREWARM_EMBEDDING_ENABLED
        ? await withTimeout(
            createEmbeddingDetailed(env.QUERY_PREWARM_EMBEDDING_TEXT).then((result) => ({
              enabled: true as const,
              ok: result.ok,
              reason: result.ok ? "warmed" : result.reason,
              attempts: result.attempts,
              durationMs: result.durationMs
            })),
            timeoutMs,
            "embedding provider prewarm"
          )
        : { enabled: false };

    const summary: QueryPrewarmSummary = {
      enabled: true,
      completed: true,
      durationMs: toDurationMs(startedAt),
      jurisdictionInputs,
      jurisdictionWarmup: jurisdictionWarmup.map((entry) => ({
        input: entry.input,
        jurisdictionId: entry.jurisdictionId,
        ok: entry.ok,
        reason: entry.reason
      })),
      corpusDimensionWarmup: corpusDimensionWarmup.map((entry) => ({
        jurisdictionId: entry.jurisdictionId,
        ok: entry.ok,
        reason: entry.reason,
        sampledRows: entry.summary?.sampledRows ?? null,
        detectedDimension: entry.summary?.detectedDimension ?? null
      })),
      embeddingProviderWarmup
    };

    logInfo("Module 1 query prewarm completed.", {
      durationMs: summary.durationMs,
      jurisdictions: summary.jurisdictionWarmup,
      corpusDimensionWarmup: summary.corpusDimensionWarmup,
      embeddingProviderWarmup: summary.embeddingProviderWarmup
    });

    return summary;
  } catch (error) {
    const summary: QueryPrewarmSummary = {
      enabled: true,
      completed: false,
      durationMs: toDurationMs(startedAt),
      jurisdictionInputs,
      jurisdictionWarmup: [],
      corpusDimensionWarmup: [],
      embeddingProviderWarmup: env.QUERY_PREWARM_EMBEDDING_ENABLED
        ? {
            enabled: true,
            ok: false,
            reason: error instanceof Error ? error.message : "unknown_error",
            attempts: 0,
            durationMs: toDurationMs(startedAt)
          }
        : { enabled: false }
    };

    logWarn("Module 1 query prewarm failed; startup continues.", {
      durationMs: summary.durationMs,
      reason: error instanceof Error ? error.message : "unknown_error"
    });
    return summary;
  }
}
