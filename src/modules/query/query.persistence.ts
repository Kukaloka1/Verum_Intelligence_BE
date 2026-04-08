import { queryCitationsRepository } from "@/repositories/query-citations.repository";
import { queryLogsRepository } from "@/repositories/query-logs.repository";
import { savedQueriesRepository } from "@/repositories/saved-queries.repository";
import type { PersistQueryRecordInput, PersistQueryRecordResult } from "./query.types";

export async function persistQueryRecord(
  input: PersistQueryRecordInput
): Promise<PersistQueryRecordResult> {
  const actions = [] as PersistQueryRecordResult["actions"];

  actions.push(
    await queryLogsRepository.recordQueryLog({
      queryId: input.queryId,
      query: input.normalizedInput.query,
      jurisdiction: input.normalizedInput.jurisdiction,
      userId: input.normalizedInput.userId,
      response: input.response,
      retrievalPlan: input.retrievalPlan
    })
  );

  actions.push(
    await queryCitationsRepository.recordQueryCitations({
      queryId: input.queryId,
      citations: input.citations
    })
  );

  if (input.normalizedInput.saveQuery && input.normalizedInput.userId) {
    actions.push(
      await savedQueriesRepository.recordSavedQuery({
        queryId: input.queryId,
        userId: input.normalizedInput.userId,
        query: input.normalizedInput.query,
        jurisdiction: input.normalizedInput.jurisdiction,
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
