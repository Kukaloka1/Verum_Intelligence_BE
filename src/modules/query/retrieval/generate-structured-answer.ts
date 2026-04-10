import type {
  GeneratedAnswerResult,
  GroundedContext,
  NormalizedQueryInput,
  QueryAnswer,
  QueryCitation,
  RetrievalMethod
} from "../query.types";
import { synthesizeGroundedAnswer } from "@/services/openai/openai.query-synthesis";

interface GenerateStructuredAnswerInput {
  normalizedInput: NormalizedQueryInput;
  groundedContext: GroundedContext;
  citations: QueryCitation[];
  deferredMethods: RetrievalMethod[];
}

function buildNoResultsAnswer(normalizedInput: NormalizedQueryInput): QueryAnswer {
  return {
    summary: "No grounded sources matched this query in the current dataset.",
    body: [
      {
        sectionTitle: "Retrieval outcome",
        content:
          "The retrieval pipeline ran against stored source records but did not return evidence strong enough to produce a grounded answer."
      },
      {
        sectionTitle: "Requested query",
        content: normalizedInput.query
      }
    ],
    limitations:
      "No legal synthesis is returned when there is no grounded evidence. Try refining the query terms or jurisdiction scope."
  };
}

function buildGroundedBody(groundedContext: GroundedContext): QueryAnswer["body"] {
  return groundedContext.entries.map((entry, index) => ({
    sectionTitle: `Evidence ${index + 1}`,
    content: `${entry.sourceName} | ${entry.documentTitle}: ${entry.excerpt}`
  }));
}

function mergeLimitations(notes: Array<string | undefined>): string | undefined {
  const normalized = notes
    .map((note) => note?.trim())
    .filter((note): note is string => Boolean(note));

  if (normalized.length === 0) {
    return undefined;
  }

  return Array.from(new Set(normalized)).join(" ");
}

function buildSynthesisUnavailableAnswer(
  groundedContext: GroundedContext,
  reason: string
): GeneratedAnswerResult {
  const fallbackBody = buildGroundedBody(groundedContext).slice(0, 4);
  const limitations = mergeLimitations([
    "Grounded retrieval succeeded, but structured model synthesis is temporarily unavailable.",
    reason
  ]);

  return {
    resultStatus: "partial",
    answer: {
      summary: "Grounded evidence was found, but synthesis could not be completed by the model.",
      body: fallbackBody,
      limitations
    },
    sourcesUsed: groundedContext.entries.length,
    synthesisStatus: "partial"
  };
}

export async function generateStructuredAnswer({
  normalizedInput,
  groundedContext,
  citations,
  deferredMethods
}: GenerateStructuredAnswerInput): Promise<GeneratedAnswerResult> {
  if (!groundedContext.hasGrounding) {
    return {
      resultStatus: "no_results",
      answer: buildNoResultsAnswer(normalizedInput),
      sourcesUsed: 0,
      synthesisStatus: "not_produced"
    };
  }

  const synthesis = await synthesizeGroundedAnswer({
    normalizedInput,
    groundedContext,
    citations
  });

  if (!synthesis.ok) {
    const synthesizedFallbackReason =
      synthesis.failure === "refusal"
        ? "The model declined to provide a grounded synthesis for this request."
        : "The provider response could not be used safely for grounded synthesis.";

    return buildSynthesisUnavailableAnswer(groundedContext, synthesizedFallbackReason);
  }

  const deferredLimitations =
    deferredMethods.length > 0
      ? `Partial result: ${deferredMethods.join(
          ", "
        )} retrieval path was unavailable during this request.`
      : undefined;
  const weakSupportLimitations =
    citations.length < 2
      ? "Limited source support is available for this answer; validate against primary materials."
      : undefined;

  const resultStatus =
    deferredMethods.length > 0 || citations.length < 2 ? ("partial" as const) : ("success" as const);
  const answer: QueryAnswer = {
    ...synthesis.answer,
    limitations: mergeLimitations([
      synthesis.answer.limitations,
      deferredLimitations,
      weakSupportLimitations
    ])
  };

  return {
    resultStatus,
    answer,
    sourcesUsed: citations.length,
    synthesisStatus: resultStatus === "success" ? "complete" : "partial"
  };
}
