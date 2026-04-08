import { env } from "@/config/env";

interface UpstashCommandResponse<T> {
  result?: T;
  error?: string;
}

interface UpstashRedisConfig {
  baseUrl: string;
  token: string;
}

export interface UpstashRedisClient {
  incr: (key: string) => Promise<number>;
  expire: (key: string, ttlSeconds: number) => Promise<boolean>;
  setNxEx: (key: string, value: string, ttlSeconds: number) => Promise<boolean>;
}

let redisClient: UpstashRedisClient | null | undefined;

function getRedisConfig(): UpstashRedisConfig | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return {
    baseUrl: env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ""),
    token: env.UPSTASH_REDIS_REST_TOKEN
  };
}

async function runCommand<T>(config: UpstashRedisConfig, command: string[]): Promise<T> {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

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
