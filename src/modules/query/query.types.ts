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
export type QueryRateLimitedCode = "RATE_LIMITED" | "DUPLICATE_QUERY_SUBMISSION";

export type RetrievalMethod = "vector" | "keyword";

export interface NormalizedQueryInput {
  query: string;
  jurisdiction: string | null;
  userId: string | null;
  saveQuery: boolean;
}

export interface RetrievalPlan {
  normalizedQuery: string;
  jurisdictionInput: string | null;
  jurisdictionSlug: string | null;
  jurisdictionId: string | null;
  keywordHints: string[];
  keywordSearchQuery: string;
  vectorCandidatePoolLimit: number;
  vectorTopK: number;
  vectorSimilarityThreshold: number;
  keywordChunkLimit: number;
  keywordTitleDocumentLimit: number;
  keywordTitleChunkLimit: number;
  maxGroundedEntries: number;
  notes: string[];
}

export interface RetrievalChunkRecord {
  chunkId: string;
  documentId: string;
  content: string;
  embedding: string | null;
  sourceName: string;
  documentTitle: string;
  publishedAt: string | null;
  sourceType: string | null;
  url: string | null;
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
  matchedTerms: string[];
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
  groundedEntries: RetrievedChunkCandidate[];
  response: QuerySuccessResponse;
  citations: QueryCitation[];
}

export interface PersistQueryRecordResult {
  actions: PersistActionResult[];
}

export interface ValidationErrorContext {
  details: string[];
}
