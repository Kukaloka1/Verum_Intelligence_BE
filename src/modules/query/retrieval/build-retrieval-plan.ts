import type { NormalizedQueryInput, RetrievalPlan } from "../query.types";

function extractKeywordHints(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((word) => word.length >= 4)
        .slice(0, 12)
    )
  );
}

export function buildRetrievalPlan(input: NormalizedQueryInput): RetrievalPlan {
  const notes = [
    "Module 1 retrieval boundaries are wired.",
    "Vector and keyword retrievers currently run in scaffold mode."
  ];

  if (input.jurisdiction) {
    notes.push(`Jurisdiction scope requested: ${input.jurisdiction}`);
  }

  return {
    normalizedQuery: input.query,
    jurisdiction: input.jurisdiction,
    keywordHints: extractKeywordHints(input.query),
    notes
  };
}
