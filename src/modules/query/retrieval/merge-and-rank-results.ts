import type {
  RankedRetrievalResult,
  RetrievedChunkCandidate,
  RetrievalBranchResult
} from "../query.types";

function chooseHigherScore(
  current: RetrievedChunkCandidate | undefined,
  incoming: RetrievedChunkCandidate
): RetrievedChunkCandidate {
  if (!current) {
    return incoming;
  }

  return incoming.score > current.score ? incoming : current;
}

export function mergeAndRankResults(
  vectorResult: RetrievalBranchResult,
  keywordResult: RetrievalBranchResult
): RankedRetrievalResult {
  const combined = [...vectorResult.items, ...keywordResult.items];
  const deduped = new Map<string, RetrievedChunkCandidate>();

  for (const candidate of combined) {
    const key = `${candidate.documentId}:${candidate.chunkId}`;
    deduped.set(key, chooseHigherScore(deduped.get(key), candidate));
  }

  const rankedItems = Array.from(deduped.values()).sort((a, b) => b.score - a.score);
  const deferredMethods = [vectorResult, keywordResult]
    .filter((result) => result.deferred)
    .map((result) => result.method);

  return {
    items: rankedItems,
    deferredMethods,
    totalCandidates: combined.length
  };
}
