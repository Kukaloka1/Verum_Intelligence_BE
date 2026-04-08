import { getDbClient } from "@/db/client";
import type { TablesInsert } from "@/db/database.types";
import type {
  PersistActionResult,
  QuerySuccessResponse,
  RetrievalPlan
} from "@/modules/query/query.types";

export interface RecordQueryLogInput {
  queryId: string;
  query: string;
  jurisdictionId: string | null;
  userId: string | null;
  response: QuerySuccessResponse;
  retrievalPlan: RetrievalPlan;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function recordQueryLog(input: RecordQueryLogInput): Promise<PersistActionResult> {
  const db = getDbClient();

  const payload: TablesInsert<"query_logs"> = {
    id: input.queryId,
    user_id: input.userId && isUuid(input.userId) ? input.userId : null,
    query_text: input.query,
    jurisdiction_id: input.jurisdictionId,
    retrieval_metadata: {
      normalizedQuery: input.retrievalPlan.normalizedQuery,
      jurisdictionSlug: input.retrievalPlan.jurisdictionSlug,
      keywordHints: input.retrievalPlan.keywordHints,
      keywordSearchQuery: input.retrievalPlan.keywordSearchQuery,
      notes: input.retrievalPlan.notes
    },
    sources_used: input.response.sourcesUsed,
    result_status: input.response.resultStatus
  };

  const { error } = await db.from("query_logs").insert(payload);

  if (error) {
    return {
      target: "query_logs",
      persisted: false,
      reason: `Query log insert failed: ${error.message}`
    };
  }

  return {
    target: "query_logs",
    persisted: true,
    reason: "Query log inserted."
  };
}

export const queryLogsRepository = {
  recordQueryLog
};
