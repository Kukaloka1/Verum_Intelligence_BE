import { createHash } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { getRedisClient } from "@/services/redis/upstash-redis.client";
import { toErrorMessage } from "@/utils/errors";
import type { NormalizedQueryInput } from "../query.types";
import type { QueryActor } from "./query-guardrails.types";

const DEDUP_WINDOW_SECONDS = 15;

interface EnforceQueryDedupInput {
  actor: QueryActor;
  normalizedInput: NormalizedQueryInput;
  route: string;
  logger: FastifyBaseLogger;
}

interface QueryDedupCheckResult {
  duplicate: boolean;
}

function buildDedupKey(actor: QueryActor, normalizedInput: NormalizedQueryInput): string {
  const hashInput = `${normalizedInput.query}::${normalizedInput.jurisdiction ?? ""}`;
  const queryHash = createHash("sha256").update(hashInput).digest("hex");
  return `dedup:query:${actor.type}:${actor.id}:${queryHash}`;
}

export async function enforceQueryDedup(input: EnforceQueryDedupInput): Promise<QueryDedupCheckResult> {
  const redisClient = getRedisClient();
  if (!redisClient) {
    return { duplicate: false };
  }

  const dedupKey = buildDedupKey(input.actor, input.normalizedInput);

  try {
    const acquired = await redisClient.setNxEx(dedupKey, "1", DEDUP_WINDOW_SECONDS);
    return {
      duplicate: !acquired
    };
  } catch (error) {
    input.logger.warn(
      {
        route: input.route,
        actorType: input.actor.type,
        actorRef: input.actor.key,
        guardrail: "query_dedup",
        error: toErrorMessage(error),
        timestamp: new Date().toISOString()
      },
      "Query dedup check failed. Continuing in fail-open mode."
    );

    return { duplicate: false };
  }
}
