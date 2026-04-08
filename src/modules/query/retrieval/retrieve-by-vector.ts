import type { RetrievalBranchResult, RetrievalPlan } from "../query.types";

export async function retrieveByVector(_plan: RetrievalPlan): Promise<RetrievalBranchResult> {
  return {
    method: "vector",
    items: [],
    deferred: true,
    reason: "Vector retrieval hook is scaffolded for Module 1 contract completion."
  };
}
