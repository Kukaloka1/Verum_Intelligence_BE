import type { FastifyInstance } from "fastify";
import { getRedisClient } from "@/services/redis/upstash-redis.client";

export async function registerRedis(app: FastifyInstance) {
  const redisClient = getRedisClient();

  if (!redisClient) {
    app.log.warn(
      "Upstash Redis is not configured. Query guardrails will run in fail-open mode when Redis is unavailable."
    );
    return;
  }

  app.log.info("Upstash Redis client initialized for query guardrails.");
}
