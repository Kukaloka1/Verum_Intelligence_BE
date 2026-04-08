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
    summary: `Retrieved ${citations.length} grounded citation(s) from stored source materials.`,
    body: buildGroundedBody(groundedContext),
    limitations:
      deferredMethods.length > 0
        ? `Partial result: ${deferredMethods.join(
            ", "
          )} retrieval path was unavailable during this request.`
        : undefined
  };

  return {
    resultStatus,
    answer,
    sourcesUsed: citations.length
  };
}
