import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import {
  createEmbedding,
  getConfiguredEmbeddingModelInfo
} from "@/services/openai/openai.embeddings";
import { toErrorMessage } from "@/utils/errors";

async function run() {
  const modelInfo = getConfiguredEmbeddingModelInfo();
  const corpusSummary = await queryRetrievalRepository.inspectCorpusEmbeddingDimensions({
    jurisdictionId: null
  });

  let queryEmbeddingDimension: number | null = null;
  let embeddingError: string | null = null;

  try {
    const embedding = await createEmbedding(
      "Module 1 smoke check: verify embedding dimension consistency."
    );
    queryEmbeddingDimension = embedding ? embedding.length : null;
  } catch (error) {
    embeddingError = toErrorMessage(error);
  }

  const issues: string[] = [];

  if (corpusSummary.sampledRows === 0) {
    issues.push("No embedded corpus rows were found in the current database scope.");
  }

  if (corpusSummary.mixedDimensions) {
    issues.push(
      `Corpus has mixed embedding dimensions in sampled rows: ${corpusSummary.distinctDimensions.join(
        ", "
      )}.`
    );
  }

  if (
    typeof modelInfo.expectedDimension === "number" &&
    typeof corpusSummary.detectedDimension === "number" &&
    modelInfo.expectedDimension !== corpusSummary.detectedDimension
  ) {
    issues.push(
      `Configured embedding model expects ${modelInfo.expectedDimension} (${modelInfo.source}) but corpus dimension is ${corpusSummary.detectedDimension}.`
    );
  }

  if (
    typeof queryEmbeddingDimension === "number" &&
    typeof corpusSummary.detectedDimension === "number" &&
    queryEmbeddingDimension !== corpusSummary.detectedDimension
  ) {
    issues.push(
      `Query embedding dimension ${queryEmbeddingDimension} does not match corpus dimension ${corpusSummary.detectedDimension}.`
    );
  }

  if (embeddingError) {
    issues.push(`Embedding generation failed during smoke check: ${embeddingError}`);
  }

  const report = {
    modelInfo,
    corpusSummary,
    queryEmbeddingDimension,
    issues,
    ok: issues.length === 0
  };

  console.log(JSON.stringify(report, null, 2));

  process.exit(report.ok ? 0 : 1);
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        issues: [`Unexpected smoke check failure: ${toErrorMessage(error)}`]
      },
      null,
      2
    )
  );
  process.exit(1);
});
