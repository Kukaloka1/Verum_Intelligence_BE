import type { FastifyInstance } from "fastify";
import {
  getGuardrailsRuntimeState,
  getRedisClient
} from "@/services/redis/upstash-redis.client";

export async function registerRedis(app: FastifyInstance) {
  const runtimeState = getGuardrailsRuntimeState();
  const redisClient = getRedisClient();

  if (!redisClient) {
    if (runtimeState.reason === "mode_disabled") {
      app.log.info(
        "Upstash guardrails are disabled by QUERY_GUARDRAILS_MODE=disabled. /v1/query guardrails run in local fail-open mode."
      );
      return;
    }

    if (runtimeState.reason === "mode_auto_non_production") {
      app.log.info(
        "Upstash guardrails are disabled by QUERY_GUARDRAILS_MODE=auto in non-production. /v1/query guardrails run in local fail-open mode."
      );
      return;
    }

    app.log.warn(
      "Upstash Redis config is missing while guardrails are enabled. Query guardrails will run in fail-open mode when Redis is unavailable."
    );
    return;
  }

  app.log.info("Upstash Redis client initialized for query guardrails.");
}
