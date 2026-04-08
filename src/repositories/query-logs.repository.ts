import type {
  PersistActionResult,
  QuerySuccessResponse,
  RetrievalPlan
} from "@/modules/query/query.types";

export interface RecordQueryLogInput {
  queryId: string;
  query: string;
  jurisdiction: string | null;
  userId: string | null;
  response: QuerySuccessResponse;
  retrievalPlan: RetrievalPlan;
}

async function recordQueryLog(_input: RecordQueryLogInput): Promise<PersistActionResult> {
  return {
    target: "query_logs",
    persisted: false,
    reason: "Scaffold only: query log repository is wired but DB write is intentionally deferred."
  };
}

export const queryLogsRepository = {
  recordQueryLog
};
