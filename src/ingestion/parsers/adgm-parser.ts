import type { FetchedSourceDocument, ParsedSourceRecord } from "@/ingestion/ingestion.types";
import { decodeHtmlEntities, firstNonEmptyParagraph, parseHumanDateToIso, stripHtmlToText } from "@/ingestion/text-utils";

interface AdgmGuidanceJsonItem {
  Title?: string;
  PublishDate?: string;
  UpdatedDate?: string;
  Description?: string;
  EffectiveDate?: string;
  DocumentLinkText?: string;
  DocumentLink?: string;
}

function buildContentSnapshot(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ? stripHtmlToText(part) : ""))
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function parseGuidanceJson(body: string): AdgmGuidanceJsonItem[] {
  const raw = body.match(/var\s+allItems\s*=\s*(\[[\s\S]*?\]);/)?.[1] ?? null;
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as AdgmGuidanceJsonItem[];
  } catch {
    return [];
  }
}

export function parseAdgmFsraGuidance(
  fetchedDocument: FetchedSourceDocument
): ParsedSourceRecord[] {
  const rawItems = parseGuidanceJson(fetchedDocument.body);
  const sliced = rawItems.slice(0, fetchedDocument.source.maxDocuments);

  const mapped: Array<ParsedSourceRecord | null> = sliced.map((item) => {
      const title = stripHtmlToText(item.Title ?? "");
      const description = stripHtmlToText(item.Description ?? "");
      const documentLink = decodeHtmlEntities(item.DocumentLink ?? "").trim();
      const documentLinkText = stripHtmlToText(item.DocumentLinkText ?? "");

      if (!title || !documentLink) {
        return null;
      }

      const publishedAtIso = parseHumanDateToIso(item.PublishDate ?? null);
      const effectiveAtIso = parseHumanDateToIso(item.EffectiveDate ?? null);
      const summary = firstNonEmptyParagraph(description);
      const contentSnapshot = buildContentSnapshot([
        `Title: ${title}`,
        item.PublishDate ? `Published: ${item.PublishDate}` : null,
        item.UpdatedDate ? `Updated: ${item.UpdatedDate}` : null,
        item.EffectiveDate ? `Effective: ${item.EffectiveDate}` : null,
        description,
        documentLinkText ? `Document Link Text: ${documentLinkText}` : null,
        `Document URL: ${documentLink}`
      ]);

      return {
        source: fetchedDocument.source,
        title,
        rawUrl: documentLink,
        sourceType: fetchedDocument.source.sourceType,
        publishedAtIso,
        effectiveAtIso,
        summary,
        contentSnapshot,
        metadata: {
          parser: "adgm_fsra_guidance_json",
          listingUrl: fetchedDocument.url,
          fetchedAtIso: fetchedDocument.fetchedAtIso,
          updatedDate: item.UpdatedDate ?? null,
          effectiveDate: item.EffectiveDate ?? null,
          documentLinkText
        }
      };
    });

  return mapped.filter((item): item is ParsedSourceRecord => item !== null);
}

function extractConsultationPanels(body: string): string[] {
  return Array.from(body.matchAll(/<adgm-expansion-panel[\s\S]*?<\/adgm-expansion-panel>/gi)).map(
    (match) => match[0]
  );
}

function parseConsultationPanel(
  panelHtml: string,
  fetchedDocument: FetchedSourceDocument
): ParsedSourceRecord | null {
  if (!/data-authority="FSRA"/i.test(panelHtml)) {
    return null;
  }

  const title = stripHtmlToText(panelHtml.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] ?? "");
  const description = stripHtmlToText(
    panelHtml.match(/<adgm-text\s+variant="textS">([\s\S]*?)<\/adgm-text>/i)?.[1] ?? ""
  );
  const documentUrl = decodeHtmlEntities(
    panelHtml.match(/href="(https:\/\/assets\.adgm\.com\/download\/assets\/[^"]+)"/i)?.[1] ?? ""
  ).trim();

  if (!title || !documentUrl) {
    return null;
  }

  const updatedDate = stripHtmlToText(
    panelHtml.match(/Updated\s+on:\s*<b>([^<]+)<\/b>/i)?.[1] ?? ""
  );
  const publishedAtIso = parseHumanDateToIso(updatedDate || null);

  const contentSnapshot = buildContentSnapshot([
    `Title: ${title}`,
    updatedDate ? `Updated: ${updatedDate}` : null,
    description,
    `Document URL: ${documentUrl}`
  ]);

  return {
    source: fetchedDocument.source,
    title,
    rawUrl: documentUrl,
    sourceType: fetchedDocument.source.sourceType,
    publishedAtIso,
    effectiveAtIso: null,
    summary: firstNonEmptyParagraph(description),
    contentSnapshot,
    metadata: {
      parser: "adgm_fsra_consultations_html",
      listingUrl: fetchedDocument.url,
      fetchedAtIso: fetchedDocument.fetchedAtIso,
      updatedDate: updatedDate || null
    }
  };
}

export function parseAdgmFsraConsultations(
  fetchedDocument: FetchedSourceDocument
): ParsedSourceRecord[] {
  const panels = extractConsultationPanels(fetchedDocument.body);
  const parsed = panels
    .map((panel) => parseConsultationPanel(panel, fetchedDocument))
    .filter((item): item is ParsedSourceRecord => item !== null);

  return parsed.slice(0, fetchedDocument.source.maxDocuments);
}
