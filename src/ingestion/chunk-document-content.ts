import type { ChunkDraft } from "./ingestion.types";
import { normalizeWhitespace } from "./text-utils";

const TARGET_CHUNK_CHARS = 850;
const MAX_CHUNK_CHARS = 1_000;
const CHUNK_OVERLAP_CHARS = 140;

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

function splitSegmentBySentences(segment: string): string[] {
  if (segment.length <= MAX_CHUNK_CHARS) {
    return [segment];
  }

  const sentences = segment
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    return [segment];
  }

  const split: string[] = [];
  let buffer = "";

  const flushBuffer = () => {
    const normalized = normalizeWhitespace(buffer);
    if (normalized.length > 0) {
      split.push(normalized);
    }
    buffer = "";
  };

  for (const sentence of sentences) {
    if (!buffer) {
      if (sentence.length <= MAX_CHUNK_CHARS) {
        buffer = sentence;
        continue;
      }

      let cursor = 0;
      while (cursor < sentence.length) {
        const part = sentence.slice(cursor, cursor + MAX_CHUNK_CHARS);
        split.push(normalizeWhitespace(part));
        cursor += Math.max(1, MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS);
      }
      continue;
    }

    const candidate = `${buffer} ${sentence}`;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      buffer = candidate;
      continue;
    }

    flushBuffer();
    buffer = sentence;
  }

  flushBuffer();
  return split;
}

export function chunkDocumentContent(
  contentSnapshot: string,
  metadata: Record<string, unknown>
): ChunkDraft[] {
  const segments = splitIntoSegments(contentSnapshot);
  const normalizedSegments = segments.flatMap((segment) => splitSegmentBySentences(segment));
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

  for (const segment of normalizedSegments) {
    if (!buffer) {
      buffer = segment;
      continue;
    }

    const candidate = `${buffer}\n\n${segment}`;
    if (candidate.length <= TARGET_CHUNK_CHARS) {
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
