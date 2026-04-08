import { getDbClient } from "@/db/client";
import type { RetrievalChunkRecord } from "@/modules/query/query.types";

interface JurisdictionRecord {
  id: string;
  slug: string;
  name: string;
}

interface RetrievalQueryParams {
  jurisdictionId: string | null;
  limit: number;
}

interface RetrievalDocumentChunkParams extends RetrievalQueryParams {
  documentIds: string[];
}

const CHUNK_WITH_METADATA_SELECT = `
  id,
  chunk_index,
  document_id,
  jurisdiction_id,
  regulator_id,
  content,
  embedding,
  documents!inner(
    id,
    title,
    published_at,
    source_type,
    raw_url,
    sources!inner(
      id,
      title,
      url,
      source_type
    ),
    regulators!inner(
      id,
      name,
      slug
    )
  )
`;

function toSingleObject<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }

  if (value && typeof value === "object") {
    return value as T;
  }

  return null;
}

function mapChunkRowToRecord(row: Record<string, unknown>): RetrievalChunkRecord | null {
  const chunkId = typeof row.id === "string" ? row.id : null;
  const documentId = typeof row.document_id === "string" ? row.document_id : null;
  const content = typeof row.content === "string" ? row.content : null;
  const embedding = typeof row.embedding === "string" ? row.embedding : null;
  const document = toSingleObject<Record<string, unknown>>(row.documents);

  if (!chunkId || !documentId || !content || !document) {
    return null;
  }

  const source = toSingleObject<Record<string, unknown>>(document.sources);
  const regulator = toSingleObject<Record<string, unknown>>(document.regulators);

  const regulatorName = typeof regulator?.name === "string" ? regulator.name : null;
  const sourceTitle = typeof source?.title === "string" ? source.title : null;
  const sourceUrl = typeof source?.url === "string" ? source.url : null;
  const sourceTypeFromSource = typeof source?.source_type === "string" ? source.source_type : null;

  return {
    chunkId,
    documentId,
    content,
    embedding,
    sourceName: regulatorName ?? sourceTitle ?? "Unknown source",
    documentTitle: typeof document.title === "string" ? document.title : "Untitled document",
    publishedAt: typeof document.published_at === "string" ? document.published_at : null,
    sourceType:
      typeof document.source_type === "string" ? document.source_type : sourceTypeFromSource ?? null,
    url: typeof document.raw_url === "string" ? document.raw_url : sourceUrl
  };
}

function mapChunkRows(rows: unknown[]): RetrievalChunkRecord[] {
  return rows
    .map((row) => mapChunkRowToRecord(row as Record<string, unknown>))
    .filter((row): row is RetrievalChunkRecord => row !== null);
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
  params: RetrievalQueryParams
): Promise<RetrievalChunkRecord[]> {
  if (!searchQuery.trim()) {
    return [];
  }

  const db = getDbClient();
  let query = db
    .from("chunks")
    .select(CHUNK_WITH_METADATA_SELECT)
    .textSearch("search_vector", searchQuery, {
      config: "english",
      type: "websearch"
    })
    .limit(params.limit);

  if (params.jurisdictionId) {
    query = query.eq("jurisdiction_id", params.jurisdictionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Keyword chunk retrieval failed: ${error.message}`);
  }

  return mapChunkRows((data ?? []) as unknown[]);
}

async function fetchTitleMatchedChunks(
  searchQuery: string,
  params: RetrievalQueryParams,
  documentLimit: number
): Promise<RetrievalChunkRecord[]> {
  if (!searchQuery.trim()) {
    return [];
  }

  const db = getDbClient();
  let documentsQuery = db
    .from("documents")
    .select("id")
    .textSearch("title_search_vector", searchQuery, {
      config: "english",
      type: "websearch"
    })
    .limit(documentLimit);

  if (params.jurisdictionId) {
    documentsQuery = documentsQuery.eq("jurisdiction_id", params.jurisdictionId);
  }

  const { data: documents, error: documentsError } = await documentsQuery;

  if (documentsError) {
    throw new Error(`Keyword title retrieval failed: ${documentsError.message}`);
  }

  const documentIds = (documents ?? [])
    .map((doc) => (typeof doc.id === "string" ? doc.id : null))
    .filter((id): id is string => id !== null);

  if (documentIds.length === 0) {
    return [];
  }

  return fetchChunksByDocumentIds({
    documentIds,
    jurisdictionId: params.jurisdictionId,
    limit: params.limit
  });
}

async function fetchChunksByDocumentIds(
  params: RetrievalDocumentChunkParams
): Promise<RetrievalChunkRecord[]> {
  if (params.documentIds.length === 0) {
    return [];
  }

  const db = getDbClient();
  let query = db
    .from("chunks")
    .select(CHUNK_WITH_METADATA_SELECT)
    .in("document_id", params.documentIds)
    .order("chunk_index", { ascending: true })
    .limit(params.limit);

  if (params.jurisdictionId) {
    query = query.eq("jurisdiction_id", params.jurisdictionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Document chunk retrieval failed: ${error.message}`);
  }

  return mapChunkRows((data ?? []) as unknown[]);
}

async function fetchEmbeddedChunks(params: RetrievalQueryParams): Promise<RetrievalChunkRecord[]> {
  const db = getDbClient();
  let query = db
    .from("chunks")
    .select(CHUNK_WITH_METADATA_SELECT)
    .not("embedding", "is", null)
    .order("created_at", { ascending: false })
    .limit(params.limit);

  if (params.jurisdictionId) {
    query = query.eq("jurisdiction_id", params.jurisdictionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Embedded chunk retrieval failed: ${error.message}`);
  }

  return mapChunkRows((data ?? []) as unknown[]);
}

export const queryRetrievalRepository = {
  resolveJurisdiction,
  fetchKeywordMatchedChunks,
  fetchTitleMatchedChunks,
  fetchChunksByDocumentIds,
  fetchEmbeddedChunks
};
