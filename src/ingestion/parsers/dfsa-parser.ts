import type { FetchedSourceDocument, ParsedSourceRecord } from "@/ingestion/ingestion.types";
import { fetchSourceDocument } from "@/ingestion/fetch-source-document";
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
  const withoutComments = blockHtml.replace(/<!--[\s\S]*?-->/g, " ");
  const dateMatches = Array.from(withoutComments.matchAll(/<p class="date">([\s\S]*?)<\/p>/gi));
  const publishedRaw = stripHtmlToText(dateMatches.at(-1)?.[1] ?? "");
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

interface RulebookDetailDraft {
  title: string;
  publishedRaw: string | null;
  detailUrl: string;
  bodyText: string;
  pdfLinks: string[];
}

function htmlToTextPreservingBlocks(input: string): string {
  const withoutScripts = input.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withBreaks = withoutStyles
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h1|h2|h3|h4|h5|h6|tr|div|section)>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseRulebookDateFromTitle(title: string): string | null {
  const match = title.match(/^(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+[—-]\s+/);
  if (!match) {
    return null;
  }

  return normalizeWhitespace(match[1]);
}

function absolutizeUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function extractRulebookPdfLinks(detailHtml: string, detailUrl: string): string[] {
  const links = Array.from(
    detailHtml.matchAll(/href="(\/sites\/default\/files\/[^"]+\.pdf[^"]*)"/gi)
  ).map((match) => absolutizeUrl(decodeHtmlEntities(match[1]), detailUrl));

  return Array.from(new Set(links));
}

function extractRulebookDetailDraft(detailHtml: string, detailUrl: string): RulebookDetailDraft | null {
  const title = stripHtmlToText(
    detailHtml.match(
      /<h2 class="page-title"[\s\S]*?<span class="field field--name-title[\s\S]*?>([\s\S]*?)<\/span>/i
    )?.[1] ?? ""
  );

  const bodyHtml = detailHtml.match(
    /<div class="clearfix text-formatted field field--name-body[\s\S]*?<div>\s*<\/content>/i
  )?.[0] ??
    detailHtml.match(
      /<div class="clearfix text-formatted field field--name-body[\s\S]*?<\/div>\s*<\/div>\s*<\/content>/i
    )?.[0] ??
    "";

  const bodyText = htmlToTextPreservingBlocks(bodyHtml);

  if (!title) {
    return null;
  }

  return {
    title,
    publishedRaw: parseRulebookDateFromTitle(title),
    detailUrl,
    bodyText,
    pdfLinks: extractRulebookPdfLinks(bodyHtml, detailUrl)
  };
}

function extractRulebookContentArea(html: string): string {
  return (
    html.match(
      /<div id="block-rulebook-content"[\s\S]*?<article[\s\S]*?<\/article>\s*<\/div>/i
    )?.[0] ?? html
  );
}

function shouldIncludeRulebookPath(
  path: string,
  listingPath: string,
  parserKind: FetchedSourceDocument["source"]["parser"]
): boolean {
  if (!path.startsWith("/rulebook/")) {
    return false;
  }

  if (path === listingPath) {
    return false;
  }

  const slug = path.replace(/^\/rulebook\//, "").trim().toLowerCase();
  if (!slug) {
    return false;
  }

  if (/^\d{4}(?:-\d+)?$/.test(slug)) {
    return false;
  }

  const skipSlugs = new Set([
    "dubai-financial-services-authority-dfsa",
    "consultation-papers",
    "current-papers",
    "past-papers",
    "media-releases",
    "notices",
    "waivers-and-modification-notices",
    "policy-statements",
    "supervisory-guidelines",
    "dfsa-codes-practice",
    "amendments-legislation",
    "call-evidence",
    "archive",
    "archive-2",
    "archive-4"
  ]);

  if (skipSlugs.has(slug)) {
    return false;
  }

  if (parserKind === "dfsa_rulebook_consultation_papers" && !slug.includes("consultation-paper")) {
    return false;
  }

  return true;
}

function extractRulebookDetailUrls(fetchedDocument: FetchedSourceDocument): string[] {
  const listingPath = new URL(fetchedDocument.url).pathname;
  const contentArea = extractRulebookContentArea(fetchedDocument.body);
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const match of contentArea.matchAll(/<a[^>]+href="([^"#?]+)"[^>]*>/gi)) {
    const href = decodeHtmlEntities(match[1]).trim();
    const absoluteUrl = absolutizeUrl(href, fetchedDocument.url);
    let path = "";

    try {
      path = new URL(absoluteUrl).pathname;
    } catch {
      continue;
    }

    if (!shouldIncludeRulebookPath(path, listingPath, fetchedDocument.source.parser)) {
      continue;
    }

    if (seen.has(absoluteUrl)) {
      continue;
    }

    seen.add(absoluteUrl);
    urls.push(absoluteUrl);
    if (urls.length >= fetchedDocument.source.maxDocuments) {
      break;
    }
  }

  return urls;
}

export async function parseDfsaRulebookSection(
  fetchedDocument: FetchedSourceDocument
): Promise<ParsedSourceRecord[]> {
  const detailUrls = extractRulebookDetailUrls(fetchedDocument);
  const parsed: ParsedSourceRecord[] = [];

  for (const detailUrl of detailUrls) {
    try {
      const detailDocument = await fetchSourceDocument({
        source: fetchedDocument.source,
        url: detailUrl
      });
      const detailDraft = extractRulebookDetailDraft(detailDocument.body, detailUrl);
      if (!detailDraft) {
        continue;
      }

      const publishedAtIso = parseHumanDateToIso(detailDraft.publishedRaw);
      const contentSnapshot = [
        `Title: ${detailDraft.title}`,
        detailDraft.publishedRaw ? `Published: ${detailDraft.publishedRaw}` : null,
        `Listing URL: ${fetchedDocument.url}`,
        `Document URL: ${detailDraft.detailUrl}`,
        detailDraft.pdfLinks.length > 0
          ? `PDF Links:\n${detailDraft.pdfLinks.map((link) => `- ${link}`).join("\n")}`
          : null,
        detailDraft.bodyText || null
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n\n");

      parsed.push({
        source: fetchedDocument.source,
        title: detailDraft.title,
        rawUrl: detailDraft.detailUrl,
        sourceType: fetchedDocument.source.sourceType,
        publishedAtIso,
        effectiveAtIso: null,
        summary: firstNonEmptyParagraph(detailDraft.bodyText) ?? firstNonEmptyParagraph(detailDraft.title),
        contentSnapshot,
        metadata: {
          parser: "dfsa_rulebook_detail_page",
          listingUrl: fetchedDocument.url,
          fetchedAtIso: fetchedDocument.fetchedAtIso,
          publishedRaw: detailDraft.publishedRaw,
          pdfLinks: detailDraft.pdfLinks
        }
      });
    } catch {
      continue;
    }
  }

  return parsed;
}
