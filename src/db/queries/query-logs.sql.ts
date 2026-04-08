export const queryLogsSql = {
  insertQueryLog: `
    insert into query_logs (
      id,
      user_id,
      query_text,
      jurisdiction_id,
      retrieval_metadata,
      sources_used,
      result_status
    )
    values ($1, $2, $3, $4, $5::jsonb, $6, $7)
  `
};
