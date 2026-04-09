import { getDbClient } from "@/db/client";
import type { RetrievalChunkRecord } from "@/modules/query/query.types";

interface JurisdictionRecord {
  id: string;
  slug: string;
  name: string;
}

interface KeywordMatchesParams {
  jurisdictionId: string | null;
  chunkLimit: number;
  titleDocumentLimit: number;
  titleChunkLimit: number;
}

interface VectorMatchesParams {
  jurisdictionId: string | null;
  topK: number;
  candidatePoolLimit: number;
  similarityThreshold: number;
}

interface KeywordMatchRecord extends RetrievalChunkRecord {
  matchChannel: "chunk" | "title";
  rankScore: number;
}

interface VectorMatchRecord extends RetrievalChunkRecord {
  similarity: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapRpcBaseRowToRecord(row: Record<string, unknown>): RetrievalChunkRecord | null {
  const chunkId = asString(row.chunk_id);
  const documentId = asString(row.document_id);
  const content = asString(row.content);
  const sourceName = asString(row.source_name);
  const documentTitle = asString(row.document_title);
  const publishedAt = asString(row.published_at);
  const sourceType = asString(row.source_type);
  const url = asString(row.url);

  if (!chunkId || !documentId || !content || !sourceName || !documentTitle) {
    return null;
  }

  return {
    chunkId,
    documentId,
    content,
    sourceName,
    documentTitle,
    publishedAt,
    sourceType,
    url
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function mapKeywordRpcRows(rows: unknown[]): KeywordMatchRecord[] {
  return rows
    .map((row) => {
      const record = mapRpcBaseRowToRecord(row as Record<string, unknown>);
      if (!record) {
        return null;
      }

      const rawMatchChannel =
        typeof (row as Record<string, unknown>).match_channel === "string"
          ? (row as Record<string, unknown>).match_channel
          : null;
      if (rawMatchChannel !== "chunk" && rawMatchChannel !== "title") {
        return null;
      }

      const rankScore = toFiniteNumber((row as Record<string, unknown>).rank_score) ?? 0;

      return {
        ...record,
        matchChannel: rawMatchChannel,
        rankScore
      };
    })
    .filter((row): row is KeywordMatchRecord => row !== null);
}

function mapVectorRpcRows(rows: unknown[]): VectorMatchRecord[] {
  return rows
    .map((row) => {
      const record = mapRpcBaseRowToRecord(row as Record<string, unknown>);
      if (!record) {
        return null;
      }

      const similarity = toFiniteNumber((row as Record<string, unknown>).similarity);
      if (similarity === null) {
        return null;
      }

      return {
        ...record,
        similarity
      };
    })
    .filter((row): row is VectorMatchRecord => row !== null);
}

function toPgVectorLiteral(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new Error("Query embedding is empty and cannot be converted to pgvector literal.");
  }

  return `[${embedding.join(",")}]`;
}

async function resolveJurisdiction(jurisdictionInput: string): Promise<JurisdictionRecord | null> {
  const db = getDbClient();
  const slug = jurisdictionInput.toLowerCase();

  const { data: bySlug, error: slugError } = await db
    .from("jurisdictions")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (slugError) {
    throw new Error(`Jurisdiction lookup by slug failed: ${slugError.message}`);
  }

  if (bySlug) {
    return bySlug;
  }

  const { data: byName, error: nameError } = await db
    .from("jurisdictions")
    .select("id, slug, name")
    .ilike("name", jurisdictionInput)
    .maybeSingle();

  if (nameError) {
    throw new Error(`Jurisdiction lookup by name failed: ${nameError.message}`);
  }

  return byName;
}

async function fetchKeywordMatchedChunks(
  searchQuery: string,
  params: KeywordMatchesParams
): Promise<KeywordMatchRecord[]> {
  if (!searchQuery.trim()) {
    return [];
  }

  const db = getDbClient();
  const { data, error } = await db.rpc("retrieve_keyword_matches", {
    p_search_query: searchQuery,
    p_jurisdiction_id: params.jurisdictionId ?? undefined,
    p_chunk_limit: params.chunkLimit,
    p_title_doc_limit: params.titleDocumentLimit,
    p_title_chunk_limit: params.titleChunkLimit
  });
  if (error) {
    throw new Error(`Keyword retrieval failed: ${error.message}`);
  }

  return mapKeywordRpcRows((data ?? []) as unknown[]);
}

async function fetchVectorMatchedChunks(
  queryEmbedding: number[],
  params: VectorMatchesParams
): Promise<VectorMatchRecord[]> {
  if (queryEmbedding.length === 0) {
    return [];
  }

  const db = getDbClient();
  const { data, error } = await db.rpc("retrieve_vector_matches", {
    p_query_embedding: toPgVectorLiteral(queryEmbedding),
    p_jurisdiction_id: params.jurisdictionId ?? undefined,
    p_candidate_limit: params.candidatePoolLimit,
    p_match_count: params.topK,
    p_min_similarity: params.similarityThreshold
  });
  if (error) {
    throw new Error(`Vector retrieval failed: ${error.message}`);
  }

  return mapVectorRpcRows((data ?? []) as unknown[]);
}

export const queryRetrievalRepository = {
  resolveJurisdiction,
  fetchKeywordMatchedChunks,
  fetchVectorMatchedChunks
};
