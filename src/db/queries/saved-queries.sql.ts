export const savedQueriesSql = {
  insertSavedQuery: `
    insert into saved_queries (
      user_id,
      query_text,
      jurisdiction_id,
      answer_snapshot
    )
    values ($1, $2, $3, $4::jsonb)
  `
};
