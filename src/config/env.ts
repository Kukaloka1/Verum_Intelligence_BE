import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.string().default("development"),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_DB_URL: z.string().optional(),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  QUERY_GUARDRAILS_MODE: z.enum(["auto", "enabled", "disabled"]).default("auto"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_EMBEDDING_DIMENSION: z.coerce.number().int().positive().optional(),
  OPENAI_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  OPENAI_EMBEDDING_TIMEOUT_RETRIES: z.coerce.number().int().min(0).optional(),
  OPENAI_SYNTHESIS_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  OPENAI_SYNTHESIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_SYNTHESIS_MAX_EVIDENCE_ENTRIES: z.coerce.number().int().positive().optional(),
  OPENAI_SYNTHESIS_MAX_CITATION_ENTRIES: z.coerce.number().int().positive().optional(),
  OPENAI_SYNTHESIS_MAX_EXCERPT_CHARS: z.coerce.number().int().positive().optional(),
  OPENAI_SYNTHESIS_REASONING_EFFORT: z
    .enum(["low", "medium", "high"])
    .optional()
});

export const env = envSchema.parse(process.env);
