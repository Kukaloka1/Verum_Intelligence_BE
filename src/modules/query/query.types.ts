import type { z } from "zod";
import type {
  queryAnswerSchema,
  queryCitationSchema,
  queryErrorResponseSchema,
  queryRequestBodySchema,
  queryResponseSchema,
  querySuccessResponseSchema
} from "./query.schemas";

export type QueryRequestBody = z.infer<typeof queryRequestBodySchema>;
export type QueryAnswer = z.infer<typeof queryAnswerSchema>;
export type QueryCitation = z.infer<typeof queryCitationSchema>;
export type QuerySuccessResponse = z.infer<typeof querySuccessResponseSchema>;
export type QueryErrorResponse = z.infer<typeof queryErrorResponseSchema>;
export type QueryResponse = z.infer<typeof queryResponseSchema>;

export type QuerySuccessStatus = QuerySuccessResponse["resultStatus"];
export type QueryErrorStatus = QueryErrorResponse["resultStatus"];
export type QueryResultStatus = QueryResponse["resultStatus"];

export type RetrievalMethod = "vector" | "keyword";

export interface NormalizedQueryInput {
  query: string;
  jurisdiction: string | null;
  userId: string | null;
  saveQuery: boolean;
}

export interface RetrievalPlan {
  normalizedQuery: string;
  jurisdiction: string | null;
  keywordHints: string[];
  notes: string[];
}

export interface RetrievedChunkCandidate {
  chunkId: string;
  documentId: string;
  score: number;
  excerpt: string;
  sourceName: string;
  documentTitle: string;
  publishedAt: string | null;
  sourceType: string | null;
  url: string | null;
  method: RetrievalMethod;
}

export interface RetrievalBranchResult {
  method: RetrievalMethod;
  items: RetrievedChunkCandidate[];
  deferred: boolean;
  reason: string;
}

export interface RankedRetrievalResult {
  items: RetrievedChunkCandidate[];
  deferredMethods: RetrievalMethod[];
  totalCandidates: number;
}

export interface GroundedContext {
  entries: RetrievedChunkCandidate[];
  hasGrounding: boolean;
  contextText: string;
}

export interface GeneratedAnswerResult {
  resultStatus: QuerySuccessStatus;
  answer: QueryAnswer;
  sourcesUsed: number;
}

export interface QueryExecutionResult {
  normalizedInput: NormalizedQueryInput;
  retrievalPlan: RetrievalPlan;
  vectorResult: RetrievalBranchResult;
  keywordResult: RetrievalBranchResult;
  rankedResult: RankedRetrievalResult;
  groundedContext: GroundedContext;
  citations: QueryCitation[];
  response: QuerySuccessResponse;
}

export type PersistTarget = "query_logs" | "query_citations" | "saved_queries";

export interface PersistActionResult {
  target: PersistTarget;
  persisted: boolean;
  reason: string;
}

export interface PersistQueryRecordInput {
  queryId: string;
  normalizedInput: NormalizedQueryInput;
  retrievalPlan: RetrievalPlan;
  response: QuerySuccessResponse;
  citations: QueryCitation[];
}

export interface PersistQueryRecordResult {
  actions: PersistActionResult[];
}

export interface ValidationErrorContext {
  details: string[];
}
