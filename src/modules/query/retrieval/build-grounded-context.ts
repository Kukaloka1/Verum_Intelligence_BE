import type { GroundedContext, RankedRetrievalResult } from "../query.types";

const MAX_GROUNDED_ENTRIES = 6;

export function buildGroundedContext(rankedResult: RankedRetrievalResult): GroundedContext {
  const entries = rankedResult.items.slice(0, MAX_GROUNDED_ENTRIES);
  const contextText = entries
    .map((entry, index) => `[${index + 1}] ${entry.sourceName} — ${entry.excerpt}`)
    .join("\n");

  return {
    entries,
    hasGrounding: entries.length > 0,
    contextText
  };
}
