import type { PersistActionResult, QuerySuccessResponse } from "@/modules/query/query.types";

export interface RecordSavedQueryInput {
  queryId: string;
  userId: string;
  query: string;
  jurisdiction: string | null;
  response: QuerySuccessResponse;
}

async function recordSavedQuery(_input: RecordSavedQueryInput): Promise<PersistActionResult> {
  return {
    target: "saved_queries",
    persisted: false,
    reason: "Scaffold only: saved query repository is wired but DB write is intentionally deferred."
  };
}

export const savedQueriesRepository = {
  recordSavedQuery
};
