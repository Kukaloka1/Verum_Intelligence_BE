import { env } from "@/config/env";

interface UpstashCommandResponse<T> {
  result?: T;
  error?: string;
}

interface UpstashRedisConfig {
  baseUrl: string;
  token: string;
}

const UPSTASH_COMMAND_TIMEOUT_MS = 500;

export type GuardrailsRuntimeStateReason =
  | "mode_disabled"
  | "mode_auto_non_production"
  | "missing_redis_config"
  | "enabled";

export interface GuardrailsRuntimeState {
  enabled: boolean;
  reason: GuardrailsRuntimeStateReason;
}

export interface UpstashRedisClient {
  incr: (key: string) => Promise<number>;
  expire: (key: string, ttlSeconds: number) => Promise<boolean>;
  setNxEx: (key: string, value: string, ttlSeconds: number) => Promise<boolean>;
}

let redisClient: UpstashRedisClient | null | undefined;

function resolveGuardrailsRuntimeState(): GuardrailsRuntimeState {
  if (env.QUERY_GUARDRAILS_MODE === "disabled") {
    return {
      enabled: false,
      reason: "mode_disabled"
    };
  }

  if (env.QUERY_GUARDRAILS_MODE === "auto" && env.NODE_ENV !== "production") {
    return {
      enabled: false,
      reason: "mode_auto_non_production"
    };
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      enabled: false,
      reason: "missing_redis_config"
    };
  }

  return {
    enabled: true,
    reason: "enabled"
  };
}

function getRedisConfig(): UpstashRedisConfig | null {
  const runtimeState = resolveGuardrailsRuntimeState();
  if (!runtimeState.enabled) {
    return null;
  }

  const baseUrl = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!baseUrl || !token) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token
  };
}

async function runCommand<T>(config: UpstashRedisConfig, command: string[]): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTASH_COMMAND_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify(command)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Upstash Redis command timed out after ${UPSTASH_COMMAND_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upstash Redis request failed with ${response.status}: ${body.slice(0, 220)}`);
  }

  const payload = (await response.json()) as UpstashCommandResponse<T>;
  if (payload.error) {
    throw new Error(`Upstash Redis command error: ${payload.error}`);
  }

  return payload.result as T;
}

function createRedisClient(config: UpstashRedisConfig): UpstashRedisClient {
  return {
    async incr(key: string) {
      const result = await runCommand<number | string>(config, ["INCR", key]);
      return Number(result);
    },

    async expire(key: string, ttlSeconds: number) {
      const result = await runCommand<number | string>(config, ["EXPIRE", key, String(ttlSeconds)]);
      return Number(result) === 1;
    },

    async setNxEx(key: string, value: string, ttlSeconds: number) {
      const result = await runCommand<string | null>(config, [
        "SET",
        key,
        value,
        "EX",
        String(ttlSeconds),
        "NX"
      ]);
      return result === "OK";
    }
  };
}

export function getRedisClient(): UpstashRedisClient | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const config = getRedisConfig();
  if (!config) {
    redisClient = null;
    return redisClient;
  }

  redisClient = createRedisClient(config);
  return redisClient;
}

export function getGuardrailsRuntimeState(): GuardrailsRuntimeState {
  return resolveGuardrailsRuntimeState();
}
