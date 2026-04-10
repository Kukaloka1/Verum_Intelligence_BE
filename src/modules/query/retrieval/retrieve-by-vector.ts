import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import {
  createEmbeddingDetailed,
  getConfiguredEmbeddingModelInfo
} from "@/services/openai/openai.embeddings";
import { logError } from "@/utils/logger";
import type {
  RetrievalBranchResult,
  RetrievalChunkRecord,
  RetrievalPlan,
  RetrievedChunkCandidate
} from "../query.types";

function buildBaseDiagnostics(input: {
  jurisdictionId: string | null;
  corpusEmbeddingSummary: Awaited<
    ReturnType<typeof queryRetrievalRepository.inspectCorpusEmbeddingDimensions>
  >;
  modelInfo: ReturnType<typeof getConfiguredEmbeddingModelInfo>;
}): Record<string, unknown> {
  return {
    jurisdictionId: input.jurisdictionId,
    embeddingModel: input.modelInfo.model,
    expectedDimension: input.modelInfo.expectedDimension,
    expectedDimensionSource: input.modelInfo.source,
    corpusEmbedding: {
      sampledRows: input.corpusEmbeddingSummary.sampledRows,
      detectedDimension: input.corpusEmbeddingSummary.detectedDimension,
      distinctDimensions: input.corpusEmbeddingSummary.distinctDimensions,
      mixedDimensions: input.corpusEmbeddingSummary.mixedDimensions
    }
  };
}

function toEmbeddingDeferredReasonCode(
  failure:
    | "provider_unavailable"
    | "empty_input"
    | "timeout"
    | "provider_error"
    | "invalid_payload"
    | "dimension_mismatch"
): string {
  switch (failure) {
    case "provider_unavailable":
      return "embedding_provider_unavailable";
    case "empty_input":
      return "embedding_empty_input";
    case "timeout":
      return "embedding_timeout";
    case "provider_error":
      return "embedding_provider_error";
    case "invalid_payload":
      return "embedding_invalid_payload";
    case "dimension_mismatch":
      return "embedding_dimension_mismatch";
    default:
      return "embedding_failure";
  }
}

function buildExcerpt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= 320) {
    return compact;
  }

  return `${compact.slice(0, 317)}...`;
}

function toVectorCandidate(
  record: RetrievalChunkRecord,
  similarity: number,
  matchedTerms: string[]
): RetrievedChunkCandidate {
  return {
    chunkId: record.chunkId,
    documentId: record.documentId,
    score: Math.min(Math.max(similarity, 0), 1),
    excerpt: buildExcerpt(record.content),
    sourceName: record.sourceName,
    documentTitle: record.documentTitle,
    publishedAt: record.publishedAt,
    sourceType: record.sourceType,
    url: record.url,
    method: "vector",
    matchedTerms
  };
}

function getMatchedTermsFromContent(content: string, hints: string[]): string[] {
  const normalizedContent = content.toLowerCase();
  return hints.filter((hint) => normalizedContent.includes(hint));
}

export async function retrieveByVector(plan: RetrievalPlan): Promise<RetrievalBranchResult> {
  const modelDimensionInfo = getConfiguredEmbeddingModelInfo();
  const corpusEmbeddingSummary = await queryRetrievalRepository.inspectCorpusEmbeddingDimensions({
    jurisdictionId: plan.jurisdictionId
  });
  const baseDiagnostics = buildBaseDiagnostics({
    jurisdictionId: plan.jurisdictionId,
    corpusEmbeddingSummary,
    modelInfo: modelDimensionInfo
  });

  if (corpusEmbeddingSummary.sampledRows === 0) {
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason: "Vector retrieval deferred because the current corpus scope has no embedded chunks.",
      diagnostics: {
        ...baseDiagnostics,
        deferredReasonCode: "no_embedded_chunks"
      }
    };
  }

  if (corpusEmbeddingSummary.mixedDimensions) {
    const reason = `Vector retrieval deferred due to mixed corpus embedding dimensions (${corpusEmbeddingSummary.distinctDimensions.join(
      ", "
    )}) in sampled chunks.`;
    logError("Vector retrieval blocked by mixed corpus embedding dimensions", {
      jurisdictionId: plan.jurisdictionId,
      distinctDimensions: corpusEmbeddingSummary.distinctDimensions
    });
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason,
      diagnostics: {
        ...baseDiagnostics,
        deferredReasonCode: "corpus_mixed_dimensions"
      }
    };
  }

  if (
    typeof modelDimensionInfo.expectedDimension === "number" &&
    typeof corpusEmbeddingSummary.detectedDimension === "number" &&
    modelDimensionInfo.expectedDimension !== corpusEmbeddingSummary.detectedDimension
  ) {
    const reason = `Vector retrieval deferred due to embedding model/corpus dimension mismatch (model '${modelDimensionInfo.model}' expects ${modelDimensionInfo.expectedDimension}, corpus has ${corpusEmbeddingSummary.detectedDimension}).`;
    logError("Vector retrieval blocked by embedding model/corpus dimension mismatch", {
      model: modelDimensionInfo.model,
      expectedDimension: modelDimensionInfo.expectedDimension,
      expectedSource: modelDimensionInfo.source,
      corpusDimension: corpusEmbeddingSummary.detectedDimension,
      jurisdictionId: plan.jurisdictionId
    });
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason,
      diagnostics: {
        ...baseDiagnostics,
        deferredReasonCode: "model_corpus_dimension_mismatch"
      }
    };
  }

  const embeddingResult = await createEmbeddingDetailed(plan.normalizedQuery);
  if (!embeddingResult.ok) {
    const deferredReasonCode = toEmbeddingDeferredReasonCode(embeddingResult.failure);
    const reason = `Vector retrieval deferred because query embedding failed (${embeddingResult.failure}).`;
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason,
      diagnostics: {
        ...baseDiagnostics,
        deferredReasonCode,
        embedding: {
          status: "failed",
          failure: embeddingResult.failure,
          failureReason: embeddingResult.reason,
          model: embeddingResult.model,
          expectedDimension: embeddingResult.expectedDimension,
          actualDimension: embeddingResult.actualDimension,
          attempts: embeddingResult.attempts,
          durationMs: embeddingResult.durationMs
        }
      }
    };
  }

  const queryEmbedding = embeddingResult.vector;

  if (
    typeof corpusEmbeddingSummary.detectedDimension === "number" &&
    queryEmbedding.length !== corpusEmbeddingSummary.detectedDimension
  ) {
    const reason = `Vector retrieval deferred due to query/corpus embedding mismatch (query=${queryEmbedding.length}, corpus=${corpusEmbeddingSummary.detectedDimension}).`;
    logError("Vector retrieval blocked by query/corpus embedding mismatch", {
      model: modelDimensionInfo.model,
      expectedModelDimension: modelDimensionInfo.expectedDimension,
      expectedSource: modelDimensionInfo.source,
      queryDimension: queryEmbedding.length,
      corpusDimension: corpusEmbeddingSummary.detectedDimension,
      jurisdictionId: plan.jurisdictionId
    });
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason,
      diagnostics: {
        ...baseDiagnostics,
        deferredReasonCode: "query_corpus_dimension_mismatch",
        embedding: {
          status: "ok",
          model: embeddingResult.model,
          expectedDimension: embeddingResult.expectedDimension,
          actualDimension: embeddingResult.actualDimension,
          attempts: embeddingResult.attempts,
          durationMs: embeddingResult.durationMs
        }
      }
    };
  }

  const vectorMatches = await queryRetrievalRepository.fetchVectorMatchedChunks(queryEmbedding, {
    jurisdictionId: plan.jurisdictionId,
    topK: plan.vectorTopK,
    candidatePoolLimit: plan.vectorCandidatePoolLimit,
    similarityThreshold: plan.vectorSimilarityThreshold
  });

  if (vectorMatches.length === 0) {
    return {
      method: "vector",
      items: [],
      deferred: false,
      reason:
        "Vector retrieval executed but did not find candidates above the current similarity threshold for this scope.",
      diagnostics: {
        ...baseDiagnostics,
        deferredReasonCode: null,
        embedding: {
          status: "ok",
          model: embeddingResult.model,
          expectedDimension: embeddingResult.expectedDimension,
          actualDimension: embeddingResult.actualDimension,
          attempts: embeddingResult.attempts,
          durationMs: embeddingResult.durationMs
        },
        retrieval: {
          candidatePoolLimit: plan.vectorCandidatePoolLimit,
          topK: plan.vectorTopK,
          similarityThreshold: plan.vectorSimilarityThreshold,
          matchedItems: 0
        }
      }
    };
  }

  const scoredCandidates: RetrievedChunkCandidate[] = vectorMatches.map((record) =>
    toVectorCandidate(
      record,
      record.similarity,
      getMatchedTermsFromContent(`${record.documentTitle} ${record.content}`, plan.keywordHints)
    )
  );

  return {
    method: "vector",
    items: scoredCandidates,
    deferred: false,
    reason: `Vector retrieval executed fully in SQL over ${vectorMatches.length} nearest-neighbor match(es).`,
    diagnostics: {
      ...baseDiagnostics,
      deferredReasonCode: null,
      embedding: {
        status: "ok",
        model: embeddingResult.model,
        expectedDimension: embeddingResult.expectedDimension,
        actualDimension: embeddingResult.actualDimension,
        attempts: embeddingResult.attempts,
        durationMs: embeddingResult.durationMs
      },
      retrieval: {
        candidatePoolLimit: plan.vectorCandidatePoolLimit,
        topK: plan.vectorTopK,
        similarityThreshold: plan.vectorSimilarityThreshold,
        matchedItems: vectorMatches.length
      }
    }
  };
}
