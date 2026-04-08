import type { PersistActionResult, QueryCitation } from "@/modules/query/query.types";

export interface RecordQueryCitationsInput {
  queryId: string;
  citations: QueryCitation[];
}

async function recordQueryCitations(input: RecordQueryCitationsInput): Promise<PersistActionResult> {
  if (input.citations.length === 0) {
    return {
      target: "query_citations",
      persisted: false,
      reason: "Skipped: no citations available to persist."
    };
  }

  return {
    target: "query_citations",
    persisted: false,
    reason: "Scaffold only: query citations repository is wired but DB write is intentionally deferred."
  };
}

export const queryCitationsRepository = {
  recordQueryCitations
};
