import { getOpenAIClient } from "./openai.client";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

function ensureEmbeddingVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("OpenAI embedding response did not include a vector array.");
  }

  if (!value.every((item) => typeof item === "number")) {
    throw new Error("OpenAI embedding vector contains non-numeric entries.");
  }

  return value as number[];
}

export async function createEmbedding(input: string): Promise<number[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const response = await fetch(`${client.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: client.embeddingModel,
      input
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI embeddings request failed with status ${response.status}: ${body.slice(0, 220)}`
    );
  }

  const payload = (await response.json()) as OpenAIEmbeddingResponse;
  const embedding = payload.data?.[0]?.embedding;
  return ensureEmbeddingVector(embedding);
}
