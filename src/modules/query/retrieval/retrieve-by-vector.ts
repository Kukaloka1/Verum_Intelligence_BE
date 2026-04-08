import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import { createEmbedding } from "@/services/openai/openai.embeddings";
import type {
  RetrievalBranchResult,
  RetrievalChunkRecord,
  RetrievalPlan,
  RetrievedChunkCandidate
} from "../query.types";

function parseEmbeddingVector(rawEmbedding: string | null): number[] | null {
  if (!rawEmbedding) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawEmbedding);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "number")) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function cosineSimilarity(vectorA: number[], vectorB: number[]): number | null {
  if (vectorA.length === 0 || vectorB.length === 0 || vectorA.length !== vectorB.length) {
    return null;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < vectorA.length; index += 1) {
    const valueA = vectorA[index];
    const valueB = vectorB[index];

    dotProduct += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return null;
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
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
  const embeddedChunks = await queryRetrievalRepository.fetchEmbeddedChunks({
    jurisdictionId: plan.jurisdictionId,
    limit: plan.vectorCandidatePoolLimit
  });

  if (embeddedChunks.length === 0) {
    return {
      method: "vector",
      items: [],
      deferred: false,
      reason: "Vector retrieval executed but no embedded chunks are currently stored for this scope."
    };
  }

  const queryEmbedding = await createEmbedding(plan.normalizedQuery);
  if (!queryEmbedding) {
    return {
      method: "vector",
      items: [],
      deferred: true,
      reason: "Vector retrieval deferred because query embedding could not be generated (missing or unavailable OpenAI config)."
    };
  }

  const scoredCandidates = embeddedChunks
    .map((record) => {
      const chunkEmbedding = parseEmbeddingVector(record.embedding);
      if (!chunkEmbedding) {
        return null;
      }

      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      if (similarity === null || similarity < plan.vectorSimilarityThreshold) {
        return null;
      }

      return toVectorCandidate(
        record,
        similarity,
        getMatchedTermsFromContent(`${record.documentTitle} ${record.content}`, plan.keywordHints)
      );
    })
    .filter((candidate): candidate is RetrievedChunkCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, plan.vectorTopK);

  return {
    method: "vector",
    items: scoredCandidates,
    deferred: false,
    reason: `Vector retrieval executed over ${embeddedChunks.length} embedded chunk candidate(s).`
  };
}
