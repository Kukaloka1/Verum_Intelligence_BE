import { fetchSourceDocument } from "@/ingestion/fetch-source-document";
import type { IngestionSourceDefinition } from "@/ingestion/ingestion.types";
import { toErrorMessage } from "@/utils/errors";

export interface SourceCheckResult {
  ok: boolean;
  sourceSlug: string;
  url: string;
  statusCode: number | null;
  fetchedAtIso: string | null;
  error: string | null;
}

export async function checkSource(source: IngestionSourceDefinition): Promise<SourceCheckResult> {
  try {
    const fetched = await fetchSourceDocument({ source });

    return {
      ok: true,
      sourceSlug: source.slug,
      url: fetched.url,
      statusCode: fetched.statusCode,
      fetchedAtIso: fetched.fetchedAtIso,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      sourceSlug: source.slug,
      url: source.url,
      statusCode: null,
      fetchedAtIso: null,
      error: toErrorMessage(error)
    };
  }
}
