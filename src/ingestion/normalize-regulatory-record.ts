import { createHash } from "node:crypto";
import type { NormalizedRegulatoryRecord, ParsedSourceRecord } from "./ingestion.types";
import { normalizeWhitespace, toSlug } from "./text-utils";

function deriveFallbackSlug(rawUrl: string): string {
  const path = rawUrl.split("?")[0]?.split("#")[0] ?? rawUrl;
  const segment = path.split("/").filter(Boolean).pop() ?? "document";
  return toSlug(segment, "document");
}

function computeRecordHash(input: {
  sourceSlug: string;
  rawUrl: string;
  title: string;
  contentSnapshot: string;
  sourceType: string;
}): string {
  const hashInput = [
    input.sourceSlug,
    input.rawUrl,
    input.title,
    input.sourceType,
    input.contentSnapshot
  ].join("||");

  return createHash("sha256").update(hashInput).digest("hex");
}

export function normalizeRegulatoryRecord(record: ParsedSourceRecord): NormalizedRegulatoryRecord {
  const title = normalizeWhitespace(record.title);
  const contentSnapshot = normalizeWhitespace(record.contentSnapshot || record.title);
  const summary = record.summary ? normalizeWhitespace(record.summary) : null;

  const fallbackSlug = deriveFallbackSlug(record.rawUrl);
  const slug = toSlug(title, fallbackSlug);

  const hash = computeRecordHash({
    sourceSlug: record.source.slug,
    rawUrl: record.rawUrl,
    title,
    sourceType: record.sourceType,
    contentSnapshot
  });

  return {
    source: record.source,
    title,
    rawUrl: record.rawUrl,
    sourceType: record.sourceType,
    publishedAtIso: record.publishedAtIso,
    effectiveAtIso: record.effectiveAtIso,
    summary,
    contentSnapshot,
    hash,
    slug,
    metadata: {
      ...record.metadata,
      sourceSlug: record.source.slug,
      sourceUrl: record.source.url,
      jurisdictionSlug: record.source.jurisdictionSlug,
      regulatorSlug: record.source.regulatorSlug
    }
  };
}
