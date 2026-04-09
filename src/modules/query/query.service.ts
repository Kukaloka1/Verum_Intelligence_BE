import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
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

interface QueryTimingLogger {
  info: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
}

interface QueryExecutionContext {
  logger?: QueryTimingLogger;
  requestId?: string;
}

interface QueryStageTiming {
  stage: string;
  durationMs: number;
  status: "ok" | "error";
  meta?: Record<string, unknown>;
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

function toDurationMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }

  const keys = Object.keys(meta);
  if (keys.length === 0) {
    return undefined;
  }

  return meta;
}

function measureSyncStage<T>(input: {
  timings: QueryStageTiming[];
  stage: string;
  execute: () => T;
  buildMeta?: (value: T) => Record<string, unknown>;
}): T {
  const startedAt = performance.now();

  try {
    const value = input.execute();
    input.timings.push({
      stage: input.stage,
      durationMs: toDurationMs(startedAt),
      status: "ok",
      meta: sanitizeMeta(input.buildMeta?.(value))
    });
    return value;
  } catch (error) {
    input.timings.push({
      stage: input.stage,
      durationMs: toDurationMs(startedAt),
      status: "error",
      meta: { reason: toErrorMessage(error) }
    });
    throw error;
  }
}

async function measureAsyncStage<T>(input: {
  timings: QueryStageTiming[];
  stage: string;
  execute: () => Promise<T>;
  buildMeta?: (value: T) => Record<string, unknown>;
}): Promise<T> {
  const startedAt = performance.now();

  try {
    const value = await input.execute();
    input.timings.push({
      stage: input.stage,
      durationMs: toDurationMs(startedAt),
      status: "ok",
      meta: sanitizeMeta(input.buildMeta?.(value))
    });
    return value;
  } catch (error) {
    input.timings.push({
      stage: input.stage,
      durationMs: toDurationMs(startedAt),
      status: "error",
      meta: { reason: toErrorMessage(error) }
    });
    throw error;
  }
}

export function createQueryService(overrides: Partial<QueryServiceDependencies> = {}) {
  const dependencies: QueryServiceDependencies = {
    ...defaultDependencies,
    ...overrides
  };

  async function runQueryPipelineFromNormalizedInput(
    normalizedInput: NormalizedQueryInput,
    context: QueryExecutionContext = {}
  ): Promise<QueryExecutionResult> {
    const timings: QueryStageTiming[] = [];
    const pipelineStartedAt = performance.now();
    let queryId: string | null = null;

    try {
      const retrievalPlan = await measureAsyncStage({
        timings,
        stage: "buildRetrievalPlan",
        execute: () => dependencies.buildRetrievalPlan(normalizedInput),
        buildMeta: (plan) => ({
          jurisdictionId: plan.jurisdictionId,
          keywordHintsCount: plan.keywordHints.length,
          vectorTopK: plan.vectorTopK
        })
      });

      const vectorPromise = measureAsyncStage({
        timings,
        stage: "retrieveByVector",
        execute: () => dependencies.retrieveByVector(retrievalPlan),
        buildMeta: (result) => ({
          items: result.items.length,
          deferred: result.deferred
        })
      });
      const keywordPromise = measureAsyncStage({
        timings,
        stage: "retrieveByKeyword",
        execute: () => dependencies.retrieveByKeyword(retrievalPlan),
        buildMeta: (result) => ({
          items: result.items.length,
          deferred: result.deferred
        })
      });

      const [vectorResultSettled, keywordResultSettled] = await Promise.allSettled([
        vectorPromise,
        keywordPromise
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

      const rankedResult = measureSyncStage({
        timings,
        stage: "mergeAndRankResults",
        execute: () => dependencies.mergeAndRankResults(vectorResult, keywordResult),
        buildMeta: (result) => ({
          items: result.items.length,
          deferredMethods: result.deferredMethods
        })
      });

      const groundedContext = measureSyncStage({
        timings,
        stage: "buildGroundedContext",
        execute: () => dependencies.buildGroundedContext(rankedResult, retrievalPlan),
        buildMeta: (contextResult) => ({
          hasGrounding: contextResult.hasGrounding,
          entries: contextResult.entries.length
        })
      });

      const citations = measureSyncStage({
        timings,
        stage: "formatCitations",
        execute: () => dependencies.formatCitations(groundedContext),
        buildMeta: (items) => ({ citations: items.length })
      });

      const generatedAnswer = await measureAsyncStage({
        timings,
        stage: "generateStructuredAnswer",
        execute: () =>
          dependencies.generateStructuredAnswer({
            normalizedInput,
            groundedContext,
            citations,
            deferredMethods: rankedResult.deferredMethods
          }),
        buildMeta: (answerResult) => ({
          resultStatus: answerResult.resultStatus,
          sourcesUsed: answerResult.sourcesUsed
        })
      });

      const resolvedQueryId = randomUUID();
      queryId = resolvedQueryId;
      const response = measureSyncStage({
        timings,
        stage: "buildResponsePayload",
        execute: () =>
          querySuccessResponseSchema.parse({
            resultStatus: generatedAnswer.resultStatus,
            queryId: resolvedQueryId,
            jurisdiction: normalizedInput.jurisdiction,
            answer: generatedAnswer.answer,
            citations,
            sourcesUsed: generatedAnswer.sourcesUsed
          }),
        buildMeta: (value) => ({
          resultStatus: value.resultStatus,
          sourcesUsed: value.sourcesUsed
        })
      });

      const persistResult = await measureAsyncStage({
        timings,
        stage: "persistence",
        execute: () =>
          dependencies.persistQueryRecord({
            queryId: resolvedQueryId,
            normalizedInput,
            retrievalPlan,
            groundedEntries: groundedContext.entries,
            response,
            citations
          }),
        buildMeta: (value) => ({
          actions: value.actions.length,
          persistedActions: value.actions.filter((action) => action.persisted).length
        })
      });

      const totalDurationMs = toDurationMs(pipelineStartedAt);
      context.logger?.info(
        {
          event: "query_pipeline_timing",
          requestId: context.requestId ?? null,
          queryId,
          resultStatus: response.resultStatus,
          sourcesUsed: response.sourcesUsed,
          queryLength: normalizedInput.query.length,
          jurisdiction: normalizedInput.jurisdiction,
          timings,
          totalDurationMs,
          persistedActions: persistResult.actions.filter((action) => action.persisted).length
        },
        "Query pipeline timing."
      );

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
    } catch (error) {
      context.logger?.error(
        {
          event: "query_pipeline_timing_failure",
          requestId: context.requestId ?? null,
          queryId,
          queryLength: normalizedInput.query.length,
          jurisdiction: normalizedInput.jurisdiction,
          timings,
          totalDurationMs: toDurationMs(pipelineStartedAt),
          reason: toErrorMessage(error)
        },
        "Query pipeline failed."
      );
      throw error;
    }
  }

  async function runQueryPipeline(
    input: QueryRequestBody,
    context: QueryExecutionContext = {}
  ): Promise<QueryExecutionResult> {
    const normalizeStartedAt = performance.now();
    const normalizedInput = dependencies.normalizeQueryInput(input);

    context.logger?.info(
      {
        event: "query_normalize_timing",
        requestId: context.requestId ?? null,
        durationMs: toDurationMs(normalizeStartedAt),
        queryLength: normalizedInput.query.length,
        jurisdiction: normalizedInput.jurisdiction
      },
      "Query normalization timing."
    );

    return runQueryPipelineFromNormalizedInput(normalizedInput, context);
  }

  async function executeQuery(
    input: QueryRequestBody,
    context: QueryExecutionContext = {}
  ): Promise<QuerySuccessResponse> {
    const execution = await runQueryPipeline(input, context);
    return execution.response;
  }

  async function executeQueryWithNormalizedInput(
    normalizedInput: NormalizedQueryInput,
    context: QueryExecutionContext = {}
  ): Promise<QuerySuccessResponse> {
    const execution = await runQueryPipelineFromNormalizedInput(normalizedInput, context);
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
