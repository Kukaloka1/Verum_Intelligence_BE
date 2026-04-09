import { z } from "zod";
import type {
  GroundedContext,
  NormalizedQueryInput,
  QueryAnswer,
  QueryCitation
} from "@/modules/query/query.types";
import { env } from "@/config/env";
import { toErrorMessage } from "@/utils/errors";
import { logError } from "@/utils/logger";
import { getOpenAIClient } from "./openai.client";

const MAX_OUTPUT_TOKENS = 900;
const DEFAULT_OPENAI_SYNTHESIS_TIMEOUT_MS = env.NODE_ENV === "production" ? 9000 : 14000;
const OPENAI_SYNTHESIS_TIMEOUT_MS =
  env.OPENAI_SYNTHESIS_TIMEOUT_MS ?? DEFAULT_OPENAI_SYNTHESIS_TIMEOUT_MS;
const SYNTHESIS_MAX_EVIDENCE_ENTRIES = 4;
const SYNTHESIS_MAX_CITATION_ENTRIES = 6;
const SYNTHESIS_MAX_EXCERPT_CHARS = 220;
const OPENAI_SYNTHESIS_REASONING_EFFORT = env.OPENAI_SYNTHESIS_REASONING_EFFORT ?? "low";

const synthesisOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(1600),
    body: z
      .array(
        z.object({
          sectionTitle: z.string().trim().min(1).max(140),
          content: z.string().trim().min(1).max(3000)
        })
      )
      .min(1)
      .max(8),
    limitations: z.union([z.string().trim().min(1).max(1600), z.null()])
  })
  .strict();

const synthesisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    body: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sectionTitle: { type: "string" },
          content: { type: "string" }
        },
        required: ["sectionTitle", "content"]
      }
    },
    limitations: {
      anyOf: [{ type: "string" }, { type: "null" }]
    }
  },
  required: ["summary", "body", "limitations"]
} as const;

const SYSTEM_PROMPT = [
  "You are Verum Intelligence backend synthesis for legal/regulatory research.",
  "Use only the GROUNDED_EVIDENCE and CITATION_METADATA provided by the backend.",
  "Never invent legal obligations, facts, sources, or regulator positions.",
  "If evidence is limited, explicitly acknowledge limits in 'limitations'.",
  "Do not provide legal advice; provide source-backed informational synthesis.",
  "Keep tone concise, institutional, and non-chatty.",
  "Return 2-4 sections in body unless evidence requires fewer.",
  "Return only JSON that matches the required schema."
].join(" ");

interface QuerySynthesisInput {
  normalizedInput: NormalizedQueryInput;
  groundedContext: GroundedContext;
  citations: QueryCitation[];
}

type QuerySynthesisFailureType =
  | "provider_unavailable"
  | "provider_error"
  | "refusal"
  | "invalid_output";

interface QuerySynthesisSuccessResult {
  ok: true;
  answer: QueryAnswer;
}

interface QuerySynthesisFailureResult {
  ok: false;
  failure: QuerySynthesisFailureType;
  reason: string;
}

export type QuerySynthesisResult = QuerySynthesisSuccessResult | QuerySynthesisFailureResult;

interface OpenAIResponseMessageContent {
  type?: string;
  text?: string;
  refusal?: string;
}

interface OpenAIResponseOutputItem {
  type?: string;
  content?: OpenAIResponseMessageContent[];
}

interface OpenAIResponsesCreatePayload {
  status?: string;
  incomplete_details?: {
    reason?: string | null;
  } | null;
  output?: OpenAIResponseOutputItem[];
}

type OpenAIReasoningEffort = "low" | "medium" | "high";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function buildReasoningConfig(model: string): { effort: OpenAIReasoningEffort } | undefined {
  if (!/^gpt-5/i.test(model)) {
    return undefined;
  }

  return {
    effort: OPENAI_SYNTHESIS_REASONING_EFFORT
  };
}

function clampExcerpt(excerpt: string): string {
  const compact = excerpt.replace(/\s+/g, " ").trim();
  if (compact.length <= SYNTHESIS_MAX_EXCERPT_CHARS) {
    return compact;
  }

  return `${compact.slice(0, SYNTHESIS_MAX_EXCERPT_CHARS - 3)}...`;
}

function buildUserPrompt(input: QuerySynthesisInput): string {
  const evidence = input.groundedContext.entries
    .slice(0, SYNTHESIS_MAX_EVIDENCE_ENTRIES)
    .map((entry, index) => ({
      id: index + 1,
      source: entry.sourceName,
      title: entry.documentTitle,
      date: entry.publishedAt,
      type: entry.sourceType,
      excerpt: clampExcerpt(entry.excerpt)
    }));

  const citationMetadata = input.citations.slice(0, SYNTHESIS_MAX_CITATION_ENTRIES).map((citation, index) => ({
    id: index + 1,
    source: citation.sourceName,
    title: citation.documentTitle,
    date: citation.publishedAt,
    type: citation.sourceType
  }));

  return [
    "TASK: Produce a grounded, structured answer for a regulatory/compliance query.",
    `QUERY: ${input.normalizedInput.query}`,
    `JURISDICTION: ${input.normalizedInput.jurisdiction ?? "UNSCOPED"}`,
    `EVIDENCE_COUNT: ${evidence.length}`,
    "GROUNDED_EVIDENCE_JSON:",
    JSON.stringify(evidence),
    "CITATION_METADATA_JSON:",
    JSON.stringify(citationMetadata),
    "Use only the provided evidence and citation metadata."
  ].join("\n");
}

function extractOutputText(payload: OpenAIResponsesCreatePayload): { type: "output_text"; text: string } {
  if (payload.status === "incomplete" && payload.incomplete_details?.reason === "max_output_tokens") {
    throw new Error("OpenAI synthesis response was incomplete due to max_output_tokens.");
  }

  const textParts: string[] = [];

  for (const outputItem of payload.output ?? []) {
    if (outputItem.type !== "message") {
      continue;
    }

    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === "refusal") {
        const refusalMessage = contentItem.refusal ?? "Model refused to provide a grounded synthesis.";
        const refusalError = new Error(refusalMessage);
        refusalError.name = "OpenAIRefusalError";
        throw refusalError;
      }

      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        textParts.push(contentItem.text);
      }
    }
  }

  if (textParts.length === 0) {
    throw new Error("OpenAI synthesis response did not contain output_text content.");
  }

  return {
    type: "output_text",
    text: textParts.join("\n")
  };
}

function parseStructuredAnswer(outputText: string): QueryAnswer {
  const parsedJson = JSON.parse(outputText);
  const structuredAnswer = synthesisOutputSchema.parse(parsedJson);

  if (structuredAnswer.limitations === null) {
    return {
      summary: structuredAnswer.summary,
      body: structuredAnswer.body
    };
  }

  return {
    summary: structuredAnswer.summary,
    body: structuredAnswer.body,
    limitations: structuredAnswer.limitations
  };
}

export async function synthesizeGroundedAnswer(
  input: QuerySynthesisInput
): Promise<QuerySynthesisResult> {
  const client = getOpenAIClient();
  if (!client) {
    return {
      ok: false,
      failure: "provider_unavailable",
      reason: "OPENAI_API_KEY is not configured for grounded synthesis."
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_SYNTHESIS_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${client.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: client.chatModel,
          reasoning: buildReasoningConfig(client.chatModel),
          input: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            {
              role: "user",
              content: buildUserPrompt(input)
            }
          ],
          max_output_tokens: MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "verum_grounded_query_answer",
              schema: synthesisJsonSchema,
              strict: true
            }
          }
        })
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI synthesis request failed with ${response.status}: ${body.slice(0, 220)}`);
    }

    const payload = (await response.json()) as OpenAIResponsesCreatePayload;
    const extracted = extractOutputText(payload);
    const answer = parseStructuredAnswer(extracted.text);

    return {
      ok: true,
      answer
    };
  } catch (error) {
    if (error instanceof Error && error.name === "OpenAIRefusalError") {
      logError("OpenAI grounded synthesis refusal", {
        reason: error.message
      });

      return {
        ok: false,
        failure: "refusal",
        reason: error.message
      };
    }

    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      logError("OpenAI grounded synthesis returned invalid structured output", {
        reason: toErrorMessage(error)
      });

      return {
        ok: false,
        failure: "invalid_output",
        reason: toErrorMessage(error)
      };
    }

    if (isAbortError(error)) {
      const reason = `OpenAI synthesis request timed out after ${OPENAI_SYNTHESIS_TIMEOUT_MS}ms.`;
      logError("OpenAI grounded synthesis timed out", { reason });

      return {
        ok: false,
        failure: "provider_error",
        reason
      };
    }

    logError("OpenAI grounded synthesis provider failure", {
      reason: toErrorMessage(error)
    });

    return {
      ok: false,
      failure: "provider_error",
      reason: toErrorMessage(error)
    };
  }
}
