import { randomUUID } from "node:crypto";
import { toErrorMessage } from "@/utils/errors";
import { queryErrorResponseSchema, querySuccessResponseSchema } from "./query.schemas";
import { persistQueryRecord as persistQueryRecordHook } from "./query.persistence";
import type {
  QueryErrorResponse,
  QueryExecutionResult,
  QueryRateLimitedCode,
  QueryRequestBody,
  NormalizedQueryInput,
  QuerySuccessResponse,
  ValidationErrorContext
} from "./query.types";
import { buildGroundedContext as buildGroundedContextHook } from "./retrieval/build-grounded-context";
import { buildRetrievalPlan as buildRetrievalPlanHook } from "./retrieval/build-retrieval-plan";
import { formatCitations as formatCitationsHook } from "./retrieval/format-citations";
import { generateStructuredAnswer as generateStructuredAnswerHook } from "./retrieval/generate-structured-answer";
import { mergeAndRankResults as mergeAndRankResultsHook } from "./retrieval/merge-and-rank-results";
import { normalizeQueryInput as normalizeQueryInputHook } from "./retrieval/normalize-query-input";
import { retrieveByKeyword as retrieveByKeywordHook } from "./retrieval/retrieve-by-keyword";
import { retrieveByVector as retrieveByVectorHook } from "./retrieval/retrieve-by-vector";

interface QueryServiceDependencies {
  normalizeQueryInput: typeof normalizeQueryInputHook;
  buildRetrievalPlan: typeof buildRetrievalPlanHook;
  retrieveByVector: typeof retrieveByVectorHook;
  retrieveByKeyword: typeof retrieveByKeywordHook;
  mergeAndRankResults: typeof mergeAndRankResultsHook;
  buildGroundedContext: typeof buildGroundedContextHook;
  formatCitations: typeof formatCitationsHook;
  generateStructuredAnswer: typeof generateStructuredAnswerHook;
  persistQueryRecord: typeof persistQueryRecordHook;
}

const defaultDependencies: QueryServiceDependencies = {
  normalizeQueryInput: normalizeQueryInputHook,
  buildRetrievalPlan: buildRetrievalPlanHook,
  retrieveByVector: retrieveByVectorHook,
  retrieveByKeyword: retrieveByKeywordHook,
  mergeAndRankResults: mergeAndRankResultsHook,
  buildGroundedContext: buildGroundedContextHook,
  formatCitations: formatCitationsHook,
  generateStructuredAnswer: generateStructuredAnswerHook,
  persistQueryRecord: persistQueryRecordHook
};

function buildErrorAnswer(limitations: string) {
  return {
    summary: "Query request could not be completed.",
    body: [
      {
        sectionTitle: "Execution status",
        content: limitations
      }
    ],
    limitations
  };
}

export function createQueryService(overrides: Partial<QueryServiceDependencies> = {}) {
  const dependencies: QueryServiceDependencies = {
    ...defaultDependencies,
    ...overrides
  };

  async function runQueryPipelineFromNormalizedInput(
    normalizedInput: NormalizedQueryInput
  ): Promise<QueryExecutionResult> {
    const retrievalPlan = await dependencies.buildRetrievalPlan(normalizedInput);

    const [vectorResultSettled, keywordResultSettled] = await Promise.allSettled([
      dependencies.retrieveByVector(retrievalPlan),
      dependencies.retrieveByKeyword(retrievalPlan)
    ]);

    const vectorResult =
      vectorResultSettled.status === "fulfilled"
        ? vectorResultSettled.value
        : {
            method: "vector" as const,
            items: [],
            deferred: true,
            reason: `Vector retrieval failed: ${toErrorMessage(vectorResultSettled.reason)}`
          };

    const keywordResult =
      keywordResultSettled.status === "fulfilled"
        ? keywordResultSettled.value
        : {
            method: "keyword" as const,
            items: [],
            deferred: true,
            reason: `Keyword retrieval failed: ${toErrorMessage(keywordResultSettled.reason)}`
          };

    if (vectorResultSettled.status === "rejected" && keywordResultSettled.status === "rejected") {
      throw new Error(
        `Both retrieval branches failed. Vector: ${toErrorMessage(
          vectorResultSettled.reason
        )}. Keyword: ${toErrorMessage(keywordResultSettled.reason)}.`
      );
    }

    const rankedResult = dependencies.mergeAndRankResults(vectorResult, keywordResult);
    const groundedContext = dependencies.buildGroundedContext(rankedResult, retrievalPlan);
    const citations = dependencies.formatCitations(groundedContext);
    const generatedAnswer = await dependencies.generateStructuredAnswer({
      normalizedInput,
      groundedContext,
      citations,
      deferredMethods: rankedResult.deferredMethods
    });

    const queryId = randomUUID();
    const response = querySuccessResponseSchema.parse({
      resultStatus: generatedAnswer.resultStatus,
      queryId,
      jurisdiction: normalizedInput.jurisdiction,
      answer: generatedAnswer.answer,
      citations,
      sourcesUsed: generatedAnswer.sourcesUsed
    });

    await dependencies.persistQueryRecord({
      queryId,
      normalizedInput,
      retrievalPlan,
      groundedEntries: groundedContext.entries,
      response,
      citations
    });

    return {
      normalizedInput,
      retrievalPlan,
      vectorResult,
      keywordResult,
      rankedResult,
      groundedContext,
      citations,
      response
    };
  }

  async function runQueryPipeline(input: QueryRequestBody): Promise<QueryExecutionResult> {
    const normalizedInput = dependencies.normalizeQueryInput(input);
    return runQueryPipelineFromNormalizedInput(normalizedInput);
  }

  async function executeQuery(input: QueryRequestBody): Promise<QuerySuccessResponse> {
    const execution = await runQueryPipeline(input);
    return execution.response;
  }

  async function executeQueryWithNormalizedInput(
    normalizedInput: NormalizedQueryInput
  ): Promise<QuerySuccessResponse> {
    const execution = await runQueryPipelineFromNormalizedInput(normalizedInput);
    return execution.response;
  }

  return {
    executeQuery,
    executeQueryWithNormalizedInput,
    runQueryPipeline,

    createValidationErrorResponse(context: ValidationErrorContext): QueryErrorResponse {
      return queryErrorResponseSchema.parse({
        resultStatus: "validation_error",
        queryId: null,
        jurisdiction: null,
        answer: buildErrorAnswer("Validation failed. Review request payload."),
        citations: [],
        sourcesUsed: 0,
        error: {
          code: "validation_error",
          message: "Invalid query request payload.",
          details: context.details
        }
      });
    },

    createSystemErrorResponse(message: string): QueryErrorResponse {
      return queryErrorResponseSchema.parse({
        resultStatus: "system_error",
        queryId: null,
        jurisdiction: null,
        answer: buildErrorAnswer("System failure while handling query."),
        citations: [],
        sourcesUsed: 0,
        error: {
          code: "system_error",
          message,
          details: ["Inspect backend logs for stack trace and dependency state."]
        }
      });
    },

    createRateLimitedResponse(input: {
      code: QueryRateLimitedCode;
      message: string;
      limitations: string;
      jurisdiction: string | null;
    }): QueryErrorResponse {
      return queryErrorResponseSchema.parse({
        resultStatus: "rate_limited",
        queryId: null,
        jurisdiction: input.jurisdiction,
        answer: {
          summary: "Query request was throttled.",
          body: [
            {
              sectionTitle: "Execution status",
              content: input.limitations
            }
          ],
          limitations: input.limitations
        },
        citations: [],
        sourcesUsed: 0,
        error: {
          code: input.code,
          message: input.message
        }
      });
    }
  };
}

export const queryService = createQueryService();
