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

export const queryController = {
  async postQuery(request: FastifyRequest, reply: FastifyReply) {
    try {
      const parsedBody = queryRequestBodySchema.parse(request.body);
      const normalizedInput = normalizeQueryInput(parsedBody);

      const guardrailResult = await enforceQueryGuardrails({
        normalizedInput,
        clientIp: request.ip,
        route: "/v1/query",
        logger: request.log
      });

      if (!guardrailResult.allowed) {
        const payload = queryService.createRateLimitedResponse({
          code: guardrailResult.code,
          message: guardrailResult.message,
          limitations: guardrailResult.limitations,
          jurisdiction: normalizedInput.jurisdiction
        });

        return reply.status(429).send(payload);
      }

      const response = await queryService.executeQueryWithNormalizedInput(normalizedInput);
      return reply.status(200).send(response);
    } catch (error) {
      if (error instanceof ZodError) {
        const payload = queryService.createValidationErrorResponse({
          details: mapValidationDetails(error)
        });
        return reply.status(400).send(payload);
      }

      request.log.error({ err: error }, "Query endpoint failed during execution.");
      const payload = queryService.createSystemErrorResponse(toErrorMessage(error));
      return reply.status(500).send(payload);
    }
  }
};
