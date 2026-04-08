export type IngestionParserKind =
  | "dfsa_news_listing"
  | "dfsa_alert_listing"
  | "adgm_fsra_guidance"
  | "adgm_fsra_consultations";

export interface IngestionSourceDefinition {
  slug: string;
  title: string;
  url: string;
  sourceType: string;
  jurisdictionSlug: "difc" | "adgm";
  regulatorSlug: "dfsa" | "fsra";
  parser: IngestionParserKind;
  checkMethod: "poll";
  status: "active";
  maxDocuments: number;
}

export interface FetchedSourceDocument {
  source: IngestionSourceDefinition;
  url: string;
  fetchedAtIso: string;
  statusCode: number;
  contentType: string | null;
  body: string;
}

export interface ParsedSourceRecord {
  source: IngestionSourceDefinition;
  title: string;
  rawUrl: string;
  sourceType: string;
  publishedAtIso: string | null;
  effectiveAtIso: string | null;
  summary: string | null;
  contentSnapshot: string;
  metadata: Record<string, unknown>;
}

export interface NormalizedRegulatoryRecord {
  source: IngestionSourceDefinition;
  title: string;
  rawUrl: string;
  sourceType: string;
  publishedAtIso: string | null;
  effectiveAtIso: string | null;
  summary: string | null;
  contentSnapshot: string;
  hash: string;
  slug: string;
  metadata: Record<string, unknown>;
}

export interface SourceRegistryResolution {
  sourceId: string;
  jurisdictionId: string;
  regulatorId: string;
}

export interface ChunkDraft {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface IngestionDocumentResult {
  sourceSlug: string;
  documentSlug: string;
  documentId: string;
  documentVersionId: string;
  chunksWritten: number;
  embeddedChunksWritten: number;
  skipped: boolean;
  reason: string;
}

export interface IngestionPipelineSummary {
  sourceCount: number;
  parsedRecordCount: number;
  documentsProcessed: number;
  chunksWritten: number;
  embeddedChunksWritten: number;
  failures: string[];
}
