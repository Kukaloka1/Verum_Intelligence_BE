import { toErrorMessage } from "@/utils/errors";
import type { FetchedSourceDocument, IngestionSourceDefinition } from "./ingestion.types";

const DEFAULT_TIMEOUT_MS = 30_000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FetchSourceDocumentInput {
  source: IngestionSourceDefinition;
  url?: string;
  timeoutMs?: number;
}

export async function fetchSourceDocument(
  input: FetchSourceDocumentInput
): Promise<FetchedSourceDocument> {
  const targetUrl = input.url ?? input.source.url;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Source fetch failed with HTTP ${response.status} for ${targetUrl}.`);
    }

    return {
      source: input.source,
      url: targetUrl,
      fetchedAtIso: new Date().toISOString(),
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      body
    };
  } catch (error) {
    throw new Error(`Source fetch failed for ${targetUrl}: ${toErrorMessage(error)}`);
  } finally {
    clearTimeout(timer);
  }
}
