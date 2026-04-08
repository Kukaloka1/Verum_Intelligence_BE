import type { FetchedSourceDocument, ParsedSourceRecord } from "@/ingestion/ingestion.types";
import {
  decodeHtmlEntities,
  firstNonEmptyParagraph,
  normalizeWhitespace,
  parseHumanDateToIso,
  stripHtmlToText
} from "@/ingestion/text-utils";

function buildDfsaListingItemPattern(sourceType: string): RegExp {
  const segment = sourceType === "alert" ? "alerts" : "news";
  return new RegExp(
    `<a class="item col-sm-4[^\"]*" href="(https:\\/\\/www\\.dfsa\\.ae\\/${segment}\\/[^\"#?]+)"[^>]*data-sector="${segment} all">([\\s\\S]*?)<\\/a>`,
    "g"
  );
}

function parseDfsaListingRecord(
  source: FetchedSourceDocument,
  url: string,
  blockHtml: string
): ParsedSourceRecord | null {
  const title = stripHtmlToText(blockHtml.match(/<h3 class="title">([\s\S]*?)<\/h3>/i)?.[1] ?? "");
  const publishedRaw = stripHtmlToText(
    blockHtml.match(/<p class="date">([\s\S]*?)<\/p>/i)?.[1] ?? ""
  );
  const tag = stripHtmlToText(blockHtml.match(/<p class="tag">([\s\S]*?)<\/p>/i)?.[1] ?? "");

  if (!title) {
    return null;
  }

  const publishedAtIso = parseHumanDateToIso(publishedRaw || null);
  const contentSnapshot = [
    `Title: ${title}`,
    publishedRaw ? `Published: ${publishedRaw}` : null,
    tag ? `Category: ${tag}` : null,
    `Listing URL: ${source.url}`,
    `Document URL: ${url}`
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");

  return {
    source: source.source,
    title,
    rawUrl: decodeHtmlEntities(url),
    sourceType: source.source.sourceType,
    publishedAtIso,
    effectiveAtIso: null,
    summary: firstNonEmptyParagraph(title),
    contentSnapshot,
    metadata: {
      parser: "dfsa_listing_cards",
      listingUrl: source.url,
      fetchedAtIso: source.fetchedAtIso,
      tag: tag || null,
      publishedRaw: publishedRaw || null
    }
  };
}

export async function parseDfsaListingSource(
  fetchedDocument: FetchedSourceDocument
): Promise<ParsedSourceRecord[]> {
  const pattern = buildDfsaListingItemPattern(fetchedDocument.source.sourceType);
  const results: ParsedSourceRecord[] = [];
  const seen = new Set<string>();

  for (const match of fetchedDocument.body.matchAll(pattern)) {
    const rawUrl = match[1];
    const blockHtml = match[2] ?? "";

    if (!rawUrl) {
      continue;
    }

    const url = normalizeWhitespace(decodeHtmlEntities(rawUrl));
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);

    const record = parseDfsaListingRecord(fetchedDocument, url, blockHtml);
    if (!record) {
      continue;
    }

    results.push(record);
    if (results.length >= fetchedDocument.source.maxDocuments) {
      break;
    }
  }

  return results;
}

export function parseDfsaListingSummaryOnly(
  fetchedDocument: FetchedSourceDocument
): ParsedSourceRecord[] {
  const pattern = buildDfsaListingItemPattern(fetchedDocument.source.sourceType);
  const links: string[] = [];

  for (const match of fetchedDocument.body.matchAll(pattern)) {
    if (!match[1]) {
      continue;
    }

    links.push(match[1]);
    if (links.length >= fetchedDocument.source.maxDocuments) {
      break;
    }
  }

  return links.map((url) => {
    const decodedUrl = decodeHtmlEntities(url);
    const slugPart = decodedUrl.split("/").pop() ?? decodedUrl;
    const titleGuess = normalizeWhitespace(slugPart.replace(/-/g, " "));

    return {
      source: fetchedDocument.source,
      title: titleGuess,
      rawUrl: decodedUrl,
      sourceType: fetchedDocument.source.sourceType,
      publishedAtIso: null,
      effectiveAtIso: null,
      summary: null,
      contentSnapshot: titleGuess,
      metadata: {
        parser: "dfsa_listing_fallback",
        listingUrl: fetchedDocument.url
      }
    };
  });
}
