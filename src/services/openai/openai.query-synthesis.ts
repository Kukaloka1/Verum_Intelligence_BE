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

const MAX_OUTPUT_TOKENS = env.OPENAI_SYNTHESIS_MAX_OUTPUT_TOKENS;
const OPENAI_SYNTHESIS_TIMEOUT_MS = env.OPENAI_SYNTHESIS_TIMEOUT_MS;
const SYNTHESIS_MAX_EVIDENCE_ENTRIES = env.OPENAI_SYNTHESIS_MAX_EVIDENCE_ENTRIES;
const SYNTHESIS_MAX_CITATION_ENTRIES = env.OPENAI_SYNTHESIS_MAX_CITATION_ENTRIES;
const SYNTHESIS_MAX_EXCERPT_CHARS = env.OPENAI_SYNTHESIS_MAX_EXCERPT_CHARS;
const SYNTHESIS_REQUIRED_SECTIONS = env.OPENAI_SYNTHESIS_MAX_SECTIONS;
const SYNTHESIS_SUMMARY_MAX_CHARS = env.OPENAI_SYNTHESIS_SUMMARY_MAX_CHARS;
const SYNTHESIS_SECTION_TITLE_MAX_CHARS = env.OPENAI_SYNTHESIS_SECTION_TITLE_MAX_CHARS;
const SYNTHESIS_SECTION_CONTENT_MAX_CHARS = env.OPENAI_SYNTHESIS_SECTION_CONTENT_MAX_CHARS;
const SYNTHESIS_LIMITATIONS_MAX_CHARS = env.OPENAI_SYNTHESIS_LIMITATIONS_MAX_CHARS;
const OPENAI_SYNTHESIS_REASONING_EFFORT = env.OPENAI_SYNTHESIS_REASONING_EFFORT;

const SECTION_BLUEPRINT = [
  "Strongest supported regulatory position",
  "Most relevant practical/operational implications for a compliance team",
  "Priority actions, checks, or follow-up lines of inquiry"
] as const;

const synthesisOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(SYNTHESIS_SUMMARY_MAX_CHARS),
    body: z
      .array(
        z.object({
          sectionTitle: z.string().trim().min(1).max(SYNTHESIS_SECTION_TITLE_MAX_CHARS),
          content: z.string().trim().min(1).max(SYNTHESIS_SECTION_CONTENT_MAX_CHARS)
        })
      )
      .length(SYNTHESIS_REQUIRED_SECTIONS),
    limitations: z.union([z.string().trim().min(1).max(SYNTHESIS_LIMITATIONS_MAX_CHARS), z.null()])
  })
  .strict();

const synthesisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", maxLength: SYNTHESIS_SUMMARY_MAX_CHARS },
    body: {
      type: "array",
      minItems: SYNTHESIS_REQUIRED_SECTIONS,
      maxItems: SYNTHESIS_REQUIRED_SECTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sectionTitle: { type: "string", maxLength: SYNTHESIS_SECTION_TITLE_MAX_CHARS },
          content: { type: "string", maxLength: SYNTHESIS_SECTION_CONTENT_MAX_CHARS }
        },
        required: ["sectionTitle", "content"]
      }
    },
    limitations: {
      anyOf: [{ type: "string", maxLength: SYNTHESIS_LIMITATIONS_MAX_CHARS }, { type: "null" }]
    }
  },
  required: ["summary", "body", "limitations"]
};

const SYSTEM_PROMPT = [
  "You are Verum Intelligence grounded synthesis for regulatory/compliance research.",
  "Use only provided evidence and allowed sources.",
  "Never invent facts, obligations, timelines, thresholds, entities, requirements, or sources.",
  "Write in English only.",
  "Style: institutional, direct, concise, decision-useful.",
  "Summary: one sharp conclusion sentence anchored in strongest evidence.",
  "Body: exactly 3 sections with these exact titles:",
  "1) Strongest supported regulatory position",
  "2) Most relevant practical/operational implications for a compliance team",
  "3) Priority actions, checks, or follow-up lines of inquiry",
  "For each section: one lead sentence, then exactly 3 numbered action points (1-3).",
  "Each action point must be compact and concrete.",
  "Do not repeat wording across sections.",
  "Limitations: null unless there is a concrete evidence gap; if present, one short complete sentence.",
  "Avoid disclaimer-heavy language.",
  "Return only valid JSON matching the schema."
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

function toEvidencePayload(entry: GroundedContext["entries"][number], index: number) {
  return {
    id: `E${index + 1}`,
    source: entry.sourceName,
    title: entry.documentTitle,
    excerpt: clampExcerpt(entry.excerpt)
  };
}

function toCitationPayload(citation: QueryCitation, index: number) {
  return {
    id: `C${index + 1}`,
    source: citation.sourceName,
    title: citation.documentTitle
  };
}

function buildUserPrompt(input: QuerySynthesisInput): string {
  const evidenceBlocks = input.groundedContext.entries
    .slice(0, SYNTHESIS_MAX_EVIDENCE_ENTRIES)
    .map(toEvidencePayload);

  const citationBlocks = input.citations
    .slice(0, SYNTHESIS_MAX_CITATION_ENTRIES)
    .map(toCitationPayload);

  const promptPayload = {
    task: "Grounded regulatory answer",
    question: input.normalizedInput.query,
    jurisdiction: input.normalizedInput.jurisdiction ?? "UNSCOPED",
    sectionTitles: SECTION_BLUEPRINT,
    sectionFormat:
      "Each section: one lead sentence + exactly 3 numbered action points (1-3), concise and concrete.",
    limitationsRule:
      "Use null unless there is a concrete evidence gap; if needed, one short complete sentence.",
    evidence: evidenceBlocks,
    allowedSources: citationBlocks
  };

  return `INPUT_JSON:\n${JSON.stringify(promptPayload)}`;
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
  const sanitizedSummary = sanitizeGeneratedText(structuredAnswer.summary);
  const sanitizedBody = structuredAnswer.body.map((section, index) => ({
    sectionTitle: SECTION_BLUEPRINT[index] ?? sanitizeGeneratedText(section.sectionTitle),
    content: sanitizeGeneratedText(section.content)
  }));
  const sanitizedLimitations =
    structuredAnswer.limitations === null
      ? null
      : sanitizeGeneratedText(structuredAnswer.limitations);

  if (sanitizedLimitations === null) {
    return {
      summary: sanitizedSummary,
      body: sanitizedBody
    };
  }

  return {
    summary: sanitizedSummary,
    body: sanitizedBody,
    limitations: sanitizedLimitations
  };
}

function sanitizeGeneratedText(value: string): string {
  const normalized = value.normalize("NFKC");
  const withoutControlChars = normalized
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ");
  const latinOnly = withoutControlChars.replace(
    /[^\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\n]/gu,
    " "
  );
  const compacted = latinOnly
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return compacted.length > 0 ? compacted : value.trim();
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
