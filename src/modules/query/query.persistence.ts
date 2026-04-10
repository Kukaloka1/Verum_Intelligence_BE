import { queryCitationsRepository } from "@/repositories/query-citations.repository";
import { queryLogsRepository } from "@/repositories/query-logs.repository";
import { savedQueriesRepository } from "@/repositories/saved-queries.repository";
import type { PersistQueryRecordInput, PersistQueryRecordResult } from "./query.types";

export async function persistQueryRecord(
  input: PersistQueryRecordInput
): Promise<PersistQueryRecordResult> {
  const actions = [] as PersistQueryRecordResult["actions"];

  const queryLogAction = await queryLogsRepository.recordQueryLog({
    queryId: input.queryId,
    query: input.normalizedInput.query,
    jurisdictionId: input.retrievalPlan.jurisdictionId,
    userId: input.normalizedInput.userId,
    response: input.response,
    retrievalPlan: input.retrievalPlan,
    vectorResult: input.vectorResult,
    keywordResult: input.keywordResult
  });
  actions.push(queryLogAction);

  if (queryLogAction.persisted) {
    actions.push(
      await queryCitationsRepository.recordQueryCitations({
        queryId: input.queryId,
        citations: input.citations,
        groundedEntries: input.groundedEntries
      })
    );
  } else {
    actions.push({
      target: "query_citations",
      persisted: false,
      reason: "Skipped: query log was not persisted, so citations could not be linked safely."
    });
  }

  if (input.normalizedInput.saveQuery && input.normalizedInput.userId) {
    actions.push(
      await savedQueriesRepository.recordSavedQuery({
        userId: input.normalizedInput.userId,
        query: input.normalizedInput.query,
        jurisdictionId: input.retrievalPlan.jurisdictionId,
        response: input.response
      })
    );
  } else {
    actions.push({
      target: "saved_queries",
      persisted: false,
      reason: "Skipped: saveQuery=false or userId missing."
    });
  }

  return { actions };
}
