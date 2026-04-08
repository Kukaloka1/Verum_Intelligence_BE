import type { GroundedContext, QueryCitation } from "../query.types";

export function formatCitations(groundedContext: GroundedContext): QueryCitation[] {
  const uniqueCitations = new Map<string, QueryCitation>();

  for (const entry of groundedContext.entries) {
    const key = `${entry.documentId}:${entry.url ?? "no-url"}`;
    if (uniqueCitations.has(key)) {
      continue;
    }

    uniqueCitations.set(key, {
      sourceName: entry.sourceName,
      documentTitle: entry.documentTitle,
      publishedAt: entry.publishedAt,
      sourceType: entry.sourceType,
      url: entry.url
    });
  }

  return Array.from(uniqueCitations.values());
}
