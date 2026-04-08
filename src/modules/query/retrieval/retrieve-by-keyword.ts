import type { RetrievalBranchResult, RetrievalPlan } from "../query.types";

export async function retrieveByKeyword(_plan: RetrievalPlan): Promise<RetrievalBranchResult> {
  return {
    method: "keyword",
    items: [],
    deferred: true,
    reason: "Keyword retrieval hook is scaffolded for Module 1 contract completion."
  };
}
