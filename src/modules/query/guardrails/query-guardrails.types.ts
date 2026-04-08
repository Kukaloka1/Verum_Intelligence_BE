import type { FastifyBaseLogger } from "fastify";
import type { NormalizedQueryInput } from "../query.types";

export type QueryActorType = "user" | "ip";
export type QueryRateLimitedCode = "RATE_LIMITED" | "DUPLICATE_QUERY_SUBMISSION";

export interface QueryActor {
  type: QueryActorType;
  id: string;
  key: string;
}

export interface QueryGuardrailInput {
  normalizedInput: NormalizedQueryInput;
  clientIp: string;
  route: string;
  logger: FastifyBaseLogger;
}

export interface QueryGuardrailPassResult {
  allowed: true;
  actor: QueryActor;
  rateLimitTriggered: false;
  dedupTriggered: false;
}

export interface QueryGuardrailBlockResult {
  allowed: false;
  actor: QueryActor;
  rateLimitTriggered: boolean;
  dedupTriggered: boolean;
  code: QueryRateLimitedCode;
  message: string;
  limitations: string;
}

export type QueryGuardrailResult = QueryGuardrailPassResult | QueryGuardrailBlockResult;
