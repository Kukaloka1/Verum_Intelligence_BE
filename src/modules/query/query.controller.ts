import { performance } from "node:perf_hooks";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { toErrorMessage } from "@/utils/errors";
import { enforceQueryGuardrails } from "./guardrails/enforce-query-guardrails";
import { queryRequestBodySchema } from "./query.schemas";
import { normalizeQueryInput } from "./retrieval/normalize-query-input";
import { queryService } from "./query.service";

function mapValidationDetails(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "body";
    return `${path}: ${issue.message}`;
  });
}

function toDurationMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

export const queryController = {
  async postQuery(request: FastifyRequest, reply: FastifyReply) {
    const requestStartedAt = performance.now();
    const requestTimings: Array<{ stage: string; durationMs: number }> = [];

    try {
      const normalizeStartedAt = performance.now();
      const parsedBody = queryRequestBodySchema.parse(request.body);
      const normalizedInput = normalizeQueryInput(parsedBody);
      requestTimings.push({
        stage: "normalizeInput",
        durationMs: toDurationMs(normalizeStartedAt)
      });

      const guardrailsStartedAt = performance.now();
      const guardrailResult = await enforceQueryGuardrails({
        normalizedInput,
        clientIp: request.ip,
        route: "/v1/query",
        logger: request.log
      });
      requestTimings.push({
        stage: "guardrails",
        durationMs: toDurationMs(guardrailsStartedAt)
      });

      if (!guardrailResult.allowed) {
        const payload = queryService.createRateLimitedResponse({
          code: guardrailResult.code,
          message: guardrailResult.message,
          limitations: guardrailResult.limitations,
          jurisdiction: normalizedInput.jurisdiction
        });

        request.log.info(
          {
            event: "query_request_timing",
            requestId: request.id,
            route: "/v1/query",
            resultStatus: payload.resultStatus,
            blocked: true,
            guardrailCode: guardrailResult.code,
            timings: requestTimings,
            totalDurationMs: toDurationMs(requestStartedAt)
          },
          "Query request timing."
        );

        return reply.status(429).send(payload);
      }

      const pipelineStartedAt = performance.now();
      const response = await queryService.executeQueryWithNormalizedInput(normalizedInput, {
        logger: request.log,
        requestId: request.id
      });
      requestTimings.push({
        stage: "queryPipeline",
        durationMs: toDurationMs(pipelineStartedAt)
      });

      request.log.info(
        {
          event: "query_request_timing",
          requestId: request.id,
          route: "/v1/query",
          resultStatus: response.resultStatus,
          blocked: false,
          timings: requestTimings,
          totalDurationMs: toDurationMs(requestStartedAt)
        },
        "Query request timing."
      );

      return reply.status(200).send(response);
    } catch (error) {
      if (error instanceof ZodError) {
        const payload = queryService.createValidationErrorResponse({
          details: mapValidationDetails(error)
        });

        request.log.info(
          {
            event: "query_request_timing",
            requestId: request.id,
            route: "/v1/query",
            resultStatus: payload.resultStatus,
            blocked: false,
            timings: requestTimings,
            totalDurationMs: toDurationMs(requestStartedAt)
          },
          "Query request timing."
        );

        return reply.status(400).send(payload);
      }

      request.log.error({ err: error }, "Query endpoint failed during execution.");
      const payload = queryService.createSystemErrorResponse(toErrorMessage(error));

      request.log.info(
        {
          event: "query_request_timing",
          requestId: request.id,
          route: "/v1/query",
          resultStatus: payload.resultStatus,
          blocked: false,
          timings: requestTimings,
          totalDurationMs: toDurationMs(requestStartedAt)
        },
        "Query request timing."
      );

      return reply.status(500).send(payload);
    }
  }
};
