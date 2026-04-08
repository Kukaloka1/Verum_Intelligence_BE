export const queryCitationsSql = {
  insertQueryCitation: `
    insert into query_citations (
      query_log_id,
      chunk_id,
      document_id,
      citation_order,
      source_name,
      document_title,
      published_at,
      source_type,
      url
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `
};
