import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import { createEmbedding } from "@/services/openai/openai.embeddings";
import type {
  RetrievalBranchResult,
  RetrievalChunkRecord,
  RetrievalPlan,
  RetrievedChunkCandidate
} from "../query.types";

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
  const queryEmbedding = await createEmbedding(plan.normalizedQuery);
  if (!queryEmbedding) {
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason: "Vector retrieval deferred because query embedding could not be generated (missing or unavailable OpenAI config)."
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
        "Vector retrieval executed but did not find candidates above the current similarity threshold for this scope."
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
    reason: `Vector retrieval executed fully in SQL over ${vectorMatches.length} nearest-neighbor match(es).`
  };
}
