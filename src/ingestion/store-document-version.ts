import { chunkDocumentContent } from "@/ingestion/chunk-document-content";
import type {
  IngestionDocumentResult,
  NormalizedRegulatoryRecord,
  SourceRegistryResolution
} from "@/ingestion/ingestion.types";
import { chunksRepository } from "@/repositories/chunks.repository";
import { documentsRepository } from "@/repositories/documents.repository";
import { createEmbedding } from "@/services/openai/openai.embeddings";
import { toErrorMessage } from "@/utils/errors";
import { logError, logInfo } from "@/utils/logger";

export interface StoreDocumentVersionInput {
  sourceResolution: SourceRegistryResolution;
  record: NormalizedRegulatoryRecord;
  fetchedAtIso: string;
}

async function buildChunkEmbeddings(content: string): Promise<string | null> {
  try {
    const embedding = await createEmbedding(content);
    if (!embedding) {
      return null;
    }

    return JSON.stringify(embedding);
  } catch (error) {
    logError("Embedding generation failed for chunk", {
      error: toErrorMessage(error)
    });
    return null;
  }
}

export async function storeDocumentVersion(
  input: StoreDocumentVersionInput
): Promise<IngestionDocumentResult> {
  const documentRow = await documentsRepository.upsertDocument({
    sourceId: input.sourceResolution.sourceId,
    jurisdictionId: input.sourceResolution.jurisdictionId,
    regulatorId: input.sourceResolution.regulatorId,
    slug: input.record.slug,
    title: input.record.title,
    sourceType: input.record.sourceType,
    publishedAtIso: input.record.publishedAtIso,
    effectiveAtIso: input.record.effectiveAtIso,
    rawUrl: input.record.rawUrl,
    summary: input.record.summary,
    hash: input.record.hash,
    normalizedStatus: "active"
  });

  const documentVersion = await documentsRepository.upsertDocumentVersion({
    documentId: documentRow.id,
    versionHash: input.record.hash,
    contentSnapshot: input.record.contentSnapshot,
    fetchedAtIso: input.fetchedAtIso
  });

  const existingChunkCount = await chunksRepository.countChunksForDocumentVersion(documentVersion.id);
  if (!documentVersion.inserted && existingChunkCount.total > 0 && existingChunkCount.embedded > 0) {
    return {
      sourceSlug: input.record.source.slug,
      documentSlug: input.record.slug,
      documentId: documentRow.id,
      documentVersionId: documentVersion.id,
      chunksWritten: 0,
      embeddedChunksWritten: 0,
      skipped: true,
      reason: "Skipped: document version and embedded chunks already exist."
    };
  }

  const chunkDrafts = chunkDocumentContent(input.record.contentSnapshot, {
    ...input.record.metadata,
    documentHash: input.record.hash,
    sourceSlug: input.record.source.slug,
    sourceType: input.record.sourceType
  });

  const chunksWithEmbeddings = [] as Array<{
    chunkIndex: number;
    content: string;
    tokenCount: number;
    metadata: Record<string, unknown>;
    embedding: string | null;
  }>;

  for (const chunk of chunkDrafts) {
    const embedding = await buildChunkEmbeddings(chunk.content);
    chunksWithEmbeddings.push({
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      metadata: chunk.metadata,
      embedding
    });
  }

  const chunkWriteResult = await chunksRepository.replaceChunksForDocumentVersion({
    documentId: documentRow.id,
    documentVersionId: documentVersion.id,
    jurisdictionId: input.sourceResolution.jurisdictionId,
    regulatorId: input.sourceResolution.regulatorId,
    chunks: chunksWithEmbeddings
  });

  logInfo("Stored document version for demo corpus", {
    sourceSlug: input.record.source.slug,
    documentSlug: input.record.slug,
    chunks: chunkWriteResult.total,
    embedded: chunkWriteResult.embedded,
    insertedDocumentVersion: documentVersion.inserted
  });

  return {
    sourceSlug: input.record.source.slug,
    documentSlug: input.record.slug,
    documentId: documentRow.id,
    documentVersionId: documentVersion.id,
    chunksWritten: chunkWriteResult.total,
    embeddedChunksWritten: chunkWriteResult.embedded,
    skipped: false,
    reason: documentVersion.inserted
      ? "Stored new document version, chunks, and embeddings."
      : "Refreshed existing document version chunks/embeddings."
  };
}
