import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanEnvSchema = z.enum(["true", "false"]).transform((value) => value === "true");

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
  QUERY_PREWARM_ENABLED: booleanEnvSchema.default("true"),
  QUERY_PREWARM_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  QUERY_PREWARM_JURISDICTIONS: z.string().default("DIFC,ADGM"),
  QUERY_PREWARM_EMBEDDING_ENABLED: booleanEnvSchema.default("false"),
  QUERY_PREWARM_EMBEDDING_TEXT: z
    .string()
    .default("Verum Module 1 startup warmup embedding check."),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),
  OPENAI_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(7000),
  OPENAI_EMBEDDING_SLOW_MS: z.coerce.number().int().positive().default(2500),
  OPENAI_EMBEDDING_TIMEOUT_RETRIES: z.coerce.number().int().min(0).default(1),
  OPENAI_SYNTHESIS_TIMEOUT_MS: z.coerce.number().int().positive().default(22000),
  OPENAI_SYNTHESIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(3200),
  OPENAI_SYNTHESIS_MAX_EVIDENCE_ENTRIES: z.coerce.number().int().positive().default(4),
  OPENAI_SYNTHESIS_MAX_CITATION_ENTRIES: z.coerce.number().int().positive().default(5),
  OPENAI_SYNTHESIS_MAX_EXCERPT_CHARS: z.coerce.number().int().positive().default(220),
  OPENAI_SYNTHESIS_MAX_SECTIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(3)
    .refine((value) => value === 3, {
      message:
        "OPENAI_SYNTHESIS_MAX_SECTIONS must remain 3 for Module 1 contract-stable synthesis."
    }),
  OPENAI_SYNTHESIS_SUMMARY_MAX_CHARS: z.coerce.number().int().positive().default(700),
  OPENAI_SYNTHESIS_SECTION_TITLE_MAX_CHARS: z.coerce.number().int().positive().default(88),
  OPENAI_SYNTHESIS_SECTION_CONTENT_MAX_CHARS: z.coerce.number().int().positive().default(2400),
  OPENAI_SYNTHESIS_LIMITATIONS_MAX_CHARS: z.coerce.number().int().positive().default(220),
  OPENAI_SYNTHESIS_REASONING_EFFORT: z
    .enum(["low", "medium", "high"])
    .default("low")
});

export const env = envSchema.parse(process.env);
