import type { ChunkDraft } from "./ingestion.types";
import { normalizeWhitespace } from "./text-utils";

const MAX_CHUNK_CHARS = 1_200;
const CHUNK_OVERLAP_CHARS = 200;

function approximateTokenCount(input: string): number {
  const words = input.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.25));
}

function splitIntoSegments(content: string): string[] {
  const byParagraph = content
    .split(/\n{2,}/)
    .map((segment) => normalizeWhitespace(segment))
    .filter((segment) => segment.length > 0);

  if (byParagraph.length > 0) {
    return byParagraph;
  }

  return [normalizeWhitespace(content)].filter((segment) => segment.length > 0);
}

export function chunkDocumentContent(
  contentSnapshot: string,
  metadata: Record<string, unknown>
): ChunkDraft[] {
  const segments = splitIntoSegments(contentSnapshot);
  const chunks: ChunkDraft[] = [];

  let buffer = "";

  function pushChunk(text: string) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) {
      return;
    }

    chunks.push({
      chunkIndex: chunks.length,
      content: normalized,
      tokenCount: approximateTokenCount(normalized),
      metadata
    });
  }

  for (const segment of segments) {
    if (!buffer) {
      buffer = segment;
      continue;
    }

    const candidate = `${buffer}\n\n${segment}`;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      buffer = candidate;
      continue;
    }

    pushChunk(buffer);

    if (buffer.length > CHUNK_OVERLAP_CHARS) {
      const overlap = buffer.slice(-CHUNK_OVERLAP_CHARS);
      buffer = `${overlap}\n\n${segment}`;
    } else {
      buffer = segment;
    }

    if (buffer.length > MAX_CHUNK_CHARS) {
      pushChunk(buffer.slice(0, MAX_CHUNK_CHARS));
      buffer = buffer.slice(MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS);
    }
  }

  if (buffer) {
    pushChunk(buffer);
  }

  return chunks;
}
