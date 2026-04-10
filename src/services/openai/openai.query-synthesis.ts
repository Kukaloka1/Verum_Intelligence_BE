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
  "You are Verum Intelligence grounded synthesis for regulatory and compliance research.",
  "Produce high-signal institutional analysis that is decision-useful, while staying strictly inside the provided evidence boundary.",
  "Use only the evidence blocks and citation blocks provided in the prompt.",
  "Never invent facts, obligations, timelines, thresholds, entities, requirements, or sources.",
  "Never rely on unstated model knowledge.",
  "Never cite anything outside the provided citation blocks.",

  "STYLE:",
  "Write in an institutional, analytical, executive tone.",
  "Be concise, precise, and useful.",
  "Write in English only.",
  "Use plain professional English with clean punctuation.",
  "Do not include non-English words or non-Latin characters in the answer body.",
  "Do not sound chatty, apologetic, uncertain-by-default, or disclaimer-heavy.",
  "Inside each section content, use short readable paragraphs separated by blank lines.",
  "Use numbered points when helpful for clarity.",
  "If you use ordered points, keep numbering sequential (1, 2, 3...) and do not restart numbering inside the same section.",
  "Each section must be complete and coherent; do not end mid-sentence, mid-list item, or mid-word.",
  "Use selective markdown bold for key terms only (for example **obligation**, **effective date**, **scope**).",
  "Never bold entire sentences or whole paragraphs.",

  "MANDATORY BODY STRUCTURE (EXACTLY 3 SECTIONS):",
  "Section 1: Strongest supported regulatory position.",
  "Section 2: Most relevant practical/operational implications for a compliance team.",
  "Section 3: Priority actions, checks, or follow-up lines of inquiry.",
  "Each section must add new information and avoid repetition.",

  "SUMMARY RULE:",
  "Lead with the strongest evidence-supported conclusion, not a restatement of the question.",

  "LIMITATIONS RULE:",
  "Keep limitations short and subordinate.",
  "Use limitations only for what remains unconfirmed by evidence.",
  "Do not output long legal-disclaimer paragraphs.",
  "If evidence is consultative/thematic rather than rulebook-level, state that once and move on.",

  "OUTPUT RULE:",
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

function formatEvidenceBlock(entry: GroundedContext["entries"][number], index: number): string {
  const date = entry.publishedAt ?? "n/a";
  const sourceType = entry.sourceType ?? "n/a";
  const url = entry.url ?? "n/a";

  return [
    `EVIDENCE ${index + 1}:`,
    `Source: ${entry.sourceName}`,
    `Title: ${entry.documentTitle}`,
    `Date: ${date}`,
    `Type: ${sourceType}`,
    `URL: ${url}`,
    `Excerpt: ${clampExcerpt(entry.excerpt)}`
  ].join("\n");
}

function formatCitationBlock(citation: QueryCitation, index: number): string {
  return [
    `CITATION ${index + 1}:`,
    `Source: ${citation.sourceName}`,
    `Title: ${citation.documentTitle}`,
    `Type: ${citation.sourceType ?? "n/a"}`,
    `Date: ${citation.publishedAt ?? "n/a"}`,
    `URL: ${citation.url ?? "n/a"}`
  ].join("\n");
}

function buildUserPrompt(input: QuerySynthesisInput): string {
  const evidenceBlocks = input.groundedContext.entries
    .slice(0, SYNTHESIS_MAX_EVIDENCE_ENTRIES)
    .map(formatEvidenceBlock);

  const citationBlocks = input.citations
    .slice(0, SYNTHESIS_MAX_CITATION_ENTRIES)
    .map(formatCitationBlock);

  return [
    "TASK: Produce a grounded regulatory answer that is decision-useful.",
    `QUESTION: ${input.normalizedInput.query}`,
    `JURISDICTION: ${input.normalizedInput.jurisdiction ?? "UNSCOPED"}`,
    "",
    "MANDATORY RESPONSE SHAPE:",
    "1) Strongest supported regulatory position",
    "2) Practical operational implications",
    "3) Priority actions/checks/follow-up inquiry",
    `Return exactly ${SYNTHESIS_REQUIRED_SECTIONS} body sections.`,
    "Within each section content, prefer: one concise lead sentence + short paragraphs and/or a compact numbered list.",
    "Set limitations to null unless a material evidence gap must be stated.",
    "If limitations are needed, keep them concise and non-dominant.",
    "",
    "EVIDENCE BLOCKS:",
    evidenceBlocks.length > 0 ? evidenceBlocks.join("\n\n") : "NONE",
    "",
    "CITATION BLOCKS:",
    citationBlocks.length > 0 ? citationBlocks.join("\n\n") : "NONE",
    "",
    "Use only this material."
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
  const sanitizedSummary = sanitizeGeneratedText(structuredAnswer.summary);
  const sanitizedBody = structuredAnswer.body.map((section) => ({
    sectionTitle: sanitizeGeneratedText(section.sectionTitle),
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
