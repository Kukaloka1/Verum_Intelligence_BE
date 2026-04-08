import type { GroundedContext, RankedRetrievalResult, RetrievalPlan } from "../query.types";

export function buildGroundedContext(
  rankedResult: RankedRetrievalResult,
  plan: RetrievalPlan
): GroundedContext {
  const entries = rankedResult.items.slice(0, plan.maxGroundedEntries);
  const contextText = entries
    .map((entry, index) => `[${index + 1}] ${entry.sourceName} — ${entry.excerpt}`)
    .join("\n");

  return {
    entries,
    hasGrounding: entries.length > 0,
    contextText
  };
}
