import { parseAdgmFsraConsultations, parseAdgmFsraGuidance } from "@/ingestion/parsers/adgm-parser";
import {
  parseDfsaListingSource,
  parseDfsaListingSummaryOnly,
  parseDfsaRulebookSection
} from "@/ingestion/parsers/dfsa-parser";
import type { FetchedSourceDocument, ParsedSourceRecord } from "./ingestion.types";

export async function parseSourceDocument(
  fetchedDocument: FetchedSourceDocument
): Promise<ParsedSourceRecord[]> {
  switch (fetchedDocument.source.parser) {
    case "dfsa_news_listing":
    case "dfsa_alert_listing": {
      const parsed = await parseDfsaListingSource(fetchedDocument);
      if (parsed.length > 0) {
        return parsed;
      }

      return parseDfsaListingSummaryOnly(fetchedDocument);
    }

    case "adgm_fsra_guidance":
      return parseAdgmFsraGuidance(fetchedDocument);

    case "adgm_fsra_consultations":
      return parseAdgmFsraConsultations(fetchedDocument);

    case "dfsa_rulebook_media_releases":
    case "dfsa_rulebook_consultation_papers":
      return parseDfsaRulebookSection(fetchedDocument);

    default:
      return [];
  }
}
