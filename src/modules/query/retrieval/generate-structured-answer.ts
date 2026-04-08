import type {
  GeneratedAnswerResult,
  GroundedContext,
  NormalizedQueryInput,
  QueryAnswer,
  QueryCitation,
  RetrievalMethod
} from "../query.types";

interface GenerateStructuredAnswerInput {
  normalizedInput: NormalizedQueryInput;
  groundedContext: GroundedContext;
  citations: QueryCitation[];
  deferredMethods: RetrievalMethod[];
}

function buildNoResultsAnswer(normalizedInput: NormalizedQueryInput): QueryAnswer {
  return {
    summary: "No grounded sources were retrieved for this query yet.",
    body: [
      {
        sectionTitle: "Current retrieval status",
        content:
          "The Module 1 query contract is active, but retrieval adapters are scaffolded and currently returned zero grounded records for this request."
      },
      {
        sectionTitle: "Requested query",
        content: normalizedInput.query
      }
    ],
    limitations:
      "No legal synthesis is generated without grounded citations. Implement vector/keyword retrieval to return source-backed content."
  };
}

function buildGroundedBody(groundedContext: GroundedContext): QueryAnswer["body"] {
  return groundedContext.entries.map((entry, index) => ({
    sectionTitle: `Grounded excerpt ${index + 1}`,
    content: `${entry.sourceName} | ${entry.documentTitle}: ${entry.excerpt}`
  }));
}

export function generateStructuredAnswer({
  normalizedInput,
  groundedContext,
  citations,
  deferredMethods
}: GenerateStructuredAnswerInput): GeneratedAnswerResult {
  if (!groundedContext.hasGrounding) {
    return {
      resultStatus: "no_results",
      answer: buildNoResultsAnswer(normalizedInput),
      sourcesUsed: 0
    };
  }

  const resultStatus = deferredMethods.length > 0 ? "partial" : "success";
  const answer: QueryAnswer = {
    summary: `Found ${citations.length} grounded citation(s) for the requested query context.`,
    body: buildGroundedBody(groundedContext),
    limitations:
      deferredMethods.length > 0
        ? `Partial result: ${deferredMethods.join(", ")} retrieval path is still scaffolded for full Module 1 behavior.`
        : undefined
  };

  return {
    resultStatus,
    answer,
    sourcesUsed: citations.length
  };
}
