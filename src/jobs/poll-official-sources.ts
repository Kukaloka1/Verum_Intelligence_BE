import { pathToFileURL } from "node:url";
import { fetchSourceDocument } from "@/ingestion/fetch-source-document";
import type {
  IngestionDocumentResult,
  IngestionPipelineSummary,
  ParsedSourceRecord
} from "@/ingestion/ingestion.types";
import { normalizeRegulatoryRecord } from "@/ingestion/normalize-regulatory-record";
import { parseSourceDocument } from "@/ingestion/parse-source-document";
import { getSourceRegistry } from "@/ingestion/source-registry";
import { storeDocumentVersion } from "@/ingestion/store-document-version";
import { chunksRepository } from "@/repositories/chunks.repository";
import { documentsRepository } from "@/repositories/documents.repository";
import { toErrorMessage } from "@/utils/errors";
import { logError, logInfo } from "@/utils/logger";

function dedupeRecords(records: ParsedSourceRecord[]): ParsedSourceRecord[] {
  const seen = new Set<string>();
  const deduped: ParsedSourceRecord[] = [];

  for (const record of records) {
    const key = `${record.source.slug}::${record.rawUrl}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

export interface PollOfficialSourcesResult {
  summary: IngestionPipelineSummary;
  corpusCounts: {
    documents: number;
    chunks: number;
    embeddedChunks: number;
  };
  sampleDocuments: Array<{
    id: string;
    title: string;
    rawUrl: string;
    publishedAt: string | null;
  }>;
  documentResults: IngestionDocumentResult[];
}

export async function pollOfficialSources(): Promise<PollOfficialSourcesResult> {
  const registry = getSourceRegistry();

  const summary: IngestionPipelineSummary = {
    sourceCount: registry.length,
    parsedRecordCount: 0,
    documentsProcessed: 0,
    chunksWritten: 0,
    embeddedChunksWritten: 0,
    failures: []
  };

  const documentResults: IngestionDocumentResult[] = [];

  for (const source of registry) {
    try {
      const jurisdiction = await documentsRepository.resolveJurisdictionBySlug(source.jurisdictionSlug);
      if (!jurisdiction) {
        summary.failures.push(
          `Source '${source.slug}' skipped: jurisdiction '${source.jurisdictionSlug}' not found.`
        );
        continue;
      }

      const regulator = await documentsRepository.resolveRegulatorBySlug(
        jurisdiction.id,
        source.regulatorSlug
      );

      if (!regulator) {
        summary.failures.push(
          `Source '${source.slug}' skipped: regulator '${source.regulatorSlug}' not found.`
        );
        continue;
      }

      const sourceRow = await documentsRepository.upsertSource({
        regulatorId: regulator.id,
        jurisdictionId: jurisdiction.id,
        slug: source.slug,
        sourceType: source.sourceType,
        title: source.title,
        url: source.url,
        checkMethod: source.checkMethod,
        status: source.status
      });

      const fetched = await fetchSourceDocument({ source });
      const parsed = dedupeRecords(await parseSourceDocument(fetched));
      summary.parsedRecordCount += parsed.length;

      if (parsed.length === 0) {
        summary.failures.push(`Source '${source.slug}' fetched but parser returned zero records.`);
      }

      for (const rawRecord of parsed) {
        try {
          const normalized = normalizeRegulatoryRecord(rawRecord);
          const result = await storeDocumentVersion({
            sourceResolution: {
              sourceId: sourceRow.id,
              jurisdictionId: jurisdiction.id,
              regulatorId: regulator.id
            },
            record: normalized,
            fetchedAtIso: fetched.fetchedAtIso
          });

          documentResults.push(result);
          summary.documentsProcessed += 1;
          summary.chunksWritten += result.chunksWritten;
          summary.embeddedChunksWritten += result.embeddedChunksWritten;
        } catch (error) {
          summary.failures.push(
            `Document ingest failed for source '${source.slug}' and url '${rawRecord.rawUrl}': ${toErrorMessage(
              error
            )}`
          );
        }
      }

      await documentsRepository.markSourceChecked(sourceRow.id);
      logInfo("Source ingestion cycle completed", {
        sourceSlug: source.slug,
        parsedRecords: parsed.length
      });
    } catch (error) {
      const failure = `Source '${source.slug}' ingestion failed: ${toErrorMessage(error)}`;
      summary.failures.push(failure);
      logError("Source ingestion failed", {
        sourceSlug: source.slug,
        error: toErrorMessage(error)
      });
    }
  }

  const corpusCounts = await chunksRepository.getCorpusCounts();
  const sampleDocuments = await documentsRepository.listRecentDocumentSamples(5);

  return {
    summary,
    corpusCounts,
    sampleDocuments,
    documentResults
  };
}

async function main() {
  logInfo("Starting official-source demo corpus ingestion", {
    startedAt: new Date().toISOString()
  });

  const result = await pollOfficialSources();

  logInfo("Official-source demo corpus ingestion finished", {
    summary: result.summary,
    corpusCounts: result.corpusCounts,
    sampleDocumentTitles: result.sampleDocuments.map((item) => item.title)
  });

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logError("Official-source ingestion job failed", {
      error: toErrorMessage(error)
    });
    process.exitCode = 1;
  });
}
