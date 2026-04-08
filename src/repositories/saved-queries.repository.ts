import { getDbClient } from "@/db/client";
import type { Json, TablesInsert } from "@/db/database.types";
import type { PersistActionResult, QuerySuccessResponse } from "@/modules/query/query.types";

export interface RecordSavedQueryInput {
  userId: string;
  query: string;
  jurisdictionId: string | null;
  response: QuerySuccessResponse;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function recordSavedQuery(input: RecordSavedQueryInput): Promise<PersistActionResult> {
  if (!isUuid(input.userId)) {
    return {
      target: "saved_queries",
      persisted: false,
      reason: "Skipped: userId is not a valid UUID for saved_queries.user_id."
    };
  }

  const db = getDbClient();
  const payload: TablesInsert<"saved_queries"> = {
    user_id: input.userId,
    query_text: input.query,
    jurisdiction_id: input.jurisdictionId,
    answer_snapshot: input.response as unknown as Json
  };

  const { error } = await db.from("saved_queries").insert(payload);

  if (error) {
    return {
      target: "saved_queries",
      persisted: false,
      reason: `Saved query insert failed: ${error.message}`
    };
  }

  return {
    target: "saved_queries",
    persisted: true,
    reason: "Saved query inserted."
  };
}

export const savedQueriesRepository = {
  recordSavedQuery
};
