import { enforceQueryDedup } from "./enforce-query-dedup";
import { enforceRateLimit } from "./enforce-rate-limit";
import type { QueryGuardrailInput, QueryGuardrailResult } from "./query-guardrails.types";
import { resolveQueryActor } from "./resolve-query-actor";

export async function enforceQueryGuardrails(input: QueryGuardrailInput): Promise<QueryGuardrailResult> {
  const actor = resolveQueryActor(input.normalizedInput, input.clientIp);

  const rateLimitResult = await enforceRateLimit({
    actor,
    route: input.route,
    logger: input.logger
  });

  if (rateLimitResult.limited) {
    input.logger.warn(
      {
        route: input.route,
        actorType: actor.type,
        actorRef: actor.key,
        rateLimitTriggered: true,
        dedupTriggered: false,
        timestamp: new Date().toISOString()
      },
      "Query guardrails blocked request due to rate limit."
    );

    return {
      allowed: false,
      actor,
      rateLimitTriggered: true,
      dedupTriggered: false,
      code: "RATE_LIMITED",
      message: "Too many query requests. Please try again shortly.",
      limitations: "Too many query requests were submitted in a short period."
    };
  }

  const dedupResult = await enforceQueryDedup({
    actor,
    normalizedInput: input.normalizedInput,
    route: input.route,
    logger: input.logger
  });

  if (dedupResult.duplicate) {
    input.logger.warn(
      {
        route: input.route,
        actorType: actor.type,
        actorRef: actor.key,
        rateLimitTriggered: false,
        dedupTriggered: true,
        timestamp: new Date().toISOString()
      },
      "Query guardrails blocked duplicate request within dedup window."
    );

    return {
      allowed: false,
      actor,
      rateLimitTriggered: false,
      dedupTriggered: true,
      code: "DUPLICATE_QUERY_SUBMISSION",
      message:
        "This query was submitted very recently. Please wait a few seconds before retrying.",
      limitations: "This query was submitted very recently."
    };
  }

  input.logger.info(
    {
      route: input.route,
      actorType: actor.type,
      actorRef: actor.key,
      rateLimitTriggered: false,
      dedupTriggered: false,
      timestamp: new Date().toISOString()
    },
    "Query guardrails passed."
  );

  return {
    allowed: true,
    actor,
    rateLimitTriggered: false,
    dedupTriggered: false
  };
}
