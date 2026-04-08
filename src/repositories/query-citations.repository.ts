import { getDbClient } from "@/db/client";
import type { TablesInsert } from "@/db/database.types";
import type {
  PersistActionResult,
  QueryCitation,
  RetrievedChunkCandidate
} from "@/modules/query/query.types";

export interface RecordQueryCitationsInput {
  queryId: string;
  citations: QueryCitation[];
  groundedEntries: RetrievedChunkCandidate[];
}

function findGroundedEntry(
  citation: QueryCitation,
  groundedEntries: RetrievedChunkCandidate[]
): RetrievedChunkCandidate | null {
  return (
    groundedEntries.find((entry) => {
      const sameDocumentTitle = entry.documentTitle === citation.documentTitle;
      const sameSourceName = entry.sourceName === citation.sourceName;
      const sameUrl = (entry.url ?? null) === (citation.url ?? null);
      return sameDocumentTitle && sameSourceName && sameUrl;
    }) ?? null
  );
}

async function recordQueryCitations(input: RecordQueryCitationsInput): Promise<PersistActionResult> {
  if (input.citations.length === 0) {
    return {
      target: "query_citations",
      persisted: false,
      reason: "Skipped: no citations available to persist."
    };
  }

  const db = getDbClient();
  const rows: TablesInsert<"query_citations">[] = input.citations.map((citation, index) => {
    const groundedEntry = findGroundedEntry(citation, input.groundedEntries);

    return {
      query_log_id: input.queryId,
      chunk_id: groundedEntry?.chunkId ?? null,
      document_id: groundedEntry?.documentId ?? null,
      citation_order: index + 1,
      source_name: citation.sourceName,
      document_title: citation.documentTitle,
      published_at: citation.publishedAt,
      source_type: citation.sourceType,
      url: citation.url
    };
  });

  const { error } = await db.from("query_citations").insert(rows);

  if (error) {
    return {
      target: "query_citations",
      persisted: false,
      reason: `Query citation insert failed: ${error.message}`
    };
  }

  return {
    target: "query_citations",
    persisted: true,
    reason: `Inserted ${rows.length} query citation row(s).`
  };
}

export const queryCitationsRepository = {
  recordQueryCitations
};
