import type { FastifyBaseLogger } from "fastify";
import { getRedisClient } from "@/services/redis/upstash-redis.client";
import { toErrorMessage } from "@/utils/errors";
import type { QueryActor } from "./query-guardrails.types";

const WINDOW_SECONDS = 5 * 60;
const AUTH_LIMIT = 20;
const ANON_LIMIT = 5;

interface EnforceRateLimitInput {
  actor: QueryActor;
  route: string;
  logger: FastifyBaseLogger;
}

export interface RateLimitCheckResult {
  limited: boolean;
}

function getLimitForActor(actor: QueryActor): number {
  return actor.type === "user" ? AUTH_LIMIT : ANON_LIMIT;
}

export async function enforceRateLimit(input: EnforceRateLimitInput): Promise<RateLimitCheckResult> {
  const redisClient = getRedisClient();
  if (!redisClient) {
    return { limited: false };
  }

  const rateLimitKey = `ratelimit:query:${input.actor.type}:${input.actor.id}`;
  const actorLimit = getLimitForActor(input.actor);

  try {
    const count = await redisClient.incr(rateLimitKey);
    if (count === 1) {
      await redisClient.expire(rateLimitKey, WINDOW_SECONDS);
    }

    return {
      limited: count > actorLimit
    };
  } catch (error) {
    input.logger.warn(
      {
        route: input.route,
        actorType: input.actor.type,
        actorRef: input.actor.key,
        guardrail: "rate_limit",
        error: toErrorMessage(error),
        timestamp: new Date().toISOString()
      },
      "Rate limit check failed. Continuing in fail-open mode."
    );

    return { limited: false };
  }
}
