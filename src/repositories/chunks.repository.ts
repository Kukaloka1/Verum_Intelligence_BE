import { getDbClient } from "@/db/client";
import type { Json, TablesInsert } from "@/db/database.types";

export interface ChunkWriteInputItem {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  embedding: string | null;
}

export interface ChunkWriteInput {
  documentId: string;
  documentVersionId: string;
  jurisdictionId: string;
  regulatorId: string;
  chunks: ChunkWriteInputItem[];
}

export interface ChunkCountSummary {
  total: number;
  embedded: number;
}

export interface CorpusCountSummary {
  documents: number;
  chunks: number;
  embeddedChunks: number;
}

async function countChunksForDocumentVersion(documentVersionId: string): Promise<ChunkCountSummary> {
  const db = getDbClient();

  const [{ count: totalCount, error: totalError }, { count: embeddedCount, error: embeddedError }] =
    await Promise.all([
      db
        .from("chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_version_id", documentVersionId),
      db
        .from("chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_version_id", documentVersionId)
        .not("embedding", "is", null)
    ]);

  if (totalError) {
    throw new Error(`Chunk count lookup failed: ${totalError.message}`);
  }

  if (embeddedError) {
    throw new Error(`Embedded chunk count lookup failed: ${embeddedError.message}`);
  }

  return {
    total: totalCount ?? 0,
    embedded: embeddedCount ?? 0
  };
}

async function replaceChunksForDocumentVersion(input: ChunkWriteInput): Promise<ChunkCountSummary> {
  const db = getDbClient();

  const { error: deleteError } = await db
    .from("chunks")
    .delete()
    .eq("document_version_id", input.documentVersionId);

  if (deleteError) {
    throw new Error(`Chunk cleanup failed for document version '${input.documentVersionId}': ${deleteError.message}`);
  }

  if (input.chunks.length === 0) {
    return {
      total: 0,
      embedded: 0
    };
  }

  const rows: TablesInsert<"chunks">[] = input.chunks.map((chunk) => ({
    document_id: input.documentId,
    document_version_id: input.documentVersionId,
    jurisdiction_id: input.jurisdictionId,
    regulator_id: input.regulatorId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    token_count: chunk.tokenCount,
    metadata: chunk.metadata as Json,
    embedding: chunk.embedding
  }));

  const { error: insertError } = await db.from("chunks").insert(rows);

  if (insertError) {
    throw new Error(`Chunk insert failed for document version '${input.documentVersionId}': ${insertError.message}`);
  }

  const embedded = input.chunks.filter((chunk) => chunk.embedding !== null).length;
  return {
    total: input.chunks.length,
    embedded
  };
}

async function getCorpusCounts(): Promise<CorpusCountSummary> {
  const db = getDbClient();

  const [
    { count: documentsCount, error: documentsError },
    { count: chunksCount, error: chunksError },
    { count: embeddedChunksCount, error: embeddedChunksError }
  ] = await Promise.all([
    db.from("documents").select("id", { count: "exact", head: true }),
    db.from("chunks").select("id", { count: "exact", head: true }),
    db.from("chunks").select("id", { count: "exact", head: true }).not("embedding", "is", null)
  ]);

  if (documentsError) {
    throw new Error(`Documents count query failed: ${documentsError.message}`);
  }

  if (chunksError) {
    throw new Error(`Chunks count query failed: ${chunksError.message}`);
  }

  if (embeddedChunksError) {
    throw new Error(`Embedded chunks count query failed: ${embeddedChunksError.message}`);
  }

  return {
    documents: documentsCount ?? 0,
    chunks: chunksCount ?? 0,
    embeddedChunks: embeddedChunksCount ?? 0
  };
}

export const chunksRepository = {
  countChunksForDocumentVersion,
  replaceChunksForDocumentVersion,
  getCorpusCounts
};
