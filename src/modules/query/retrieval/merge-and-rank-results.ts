import type {
  RankedRetrievalResult,
  RetrievedChunkCandidate,
  RetrievalMethod,
  RetrievalBranchResult
} from "../query.types";

interface CandidateAggregate {
  best: RetrievedChunkCandidate;
  methods: Set<RetrievalMethod>;
}

export function mergeAndRankResults(
  vectorResult: RetrievalBranchResult,
  keywordResult: RetrievalBranchResult
): RankedRetrievalResult {
  const combined = [...vectorResult.items, ...keywordResult.items];
  const deduped = new Map<string, CandidateAggregate>();

  for (const candidate of combined) {
    const key = `${candidate.documentId}:${candidate.chunkId}`;
    const aggregate = deduped.get(key);
    if (!aggregate) {
      deduped.set(key, {
        best: candidate,
        methods: new Set([candidate.method])
      });
      continue;
    }

    aggregate.methods.add(candidate.method);
    if (candidate.score > aggregate.best.score) {
      aggregate.best = candidate;
    }
  }

  const rankedItems = Array.from(deduped.values())
    .map((aggregate) => {
      const crossSignalBoost = aggregate.methods.size > 1 ? 0.08 : 0;
      return {
        ...aggregate.best,
        score: Math.min(aggregate.best.score + crossSignalBoost, 1)
      };
    })
    .sort((a, b) => b.score - a.score);

  const deferredMethods = [vectorResult, keywordResult]
    .filter((result) => result.deferred)
    .map((result) => result.method);

  return {
    items: rankedItems,
    deferredMethods,
    totalCandidates: combined.length
  };
}
