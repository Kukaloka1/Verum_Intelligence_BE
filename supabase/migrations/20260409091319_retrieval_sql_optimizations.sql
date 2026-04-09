-- Retrieval SQL optimizations for Module 1 query pipeline.
-- Goal: reduce retrieval latency by collapsing round-trips and moving vector ranking to pgvector SQL.

create or replace function public.retrieve_keyword_matches(
  p_search_query text,
  p_jurisdiction_id uuid default null,
  p_chunk_limit integer default 24,
  p_title_doc_limit integer default 8,
  p_title_chunk_limit integer default 18
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  source_name text,
  document_title text,
  published_at timestamptz,
  source_type text,
  url text,
  match_channel text,
  rank_score double precision
)
language sql
stable
set search_path = public
as $$
with
  search_terms as (
    select websearch_to_tsquery('english', coalesce(p_search_query, '')) as ts_query
  ),
  chunk_matches as (
    select
      c.id as chunk_id,
      c.document_id,
      c.content,
      'chunk'::text as match_channel,
      ts_rank_cd(c.search_vector, st.ts_query)::double precision as rank_score
    from chunks c
    cross join search_terms st
    where st.ts_query <> ''::tsquery
      and c.search_vector @@ st.ts_query
      and (p_jurisdiction_id is null or c.jurisdiction_id = p_jurisdiction_id)
    order by rank_score desc, c.created_at desc
    limit greatest(p_chunk_limit, 0)
  ),
  title_documents as (
    select
      d.id as document_id,
      ts_rank_cd(d.title_search_vector, st.ts_query)::double precision as title_rank
    from documents d
    cross join search_terms st
    where st.ts_query <> ''::tsquery
      and d.title_search_vector @@ st.ts_query
      and (p_jurisdiction_id is null or d.jurisdiction_id = p_jurisdiction_id)
    order by title_rank desc, d.published_at desc nulls last
    limit greatest(p_title_doc_limit, 0)
  ),
  title_chunks as (
    select
      c.id as chunk_id,
      c.document_id,
      c.content,
      'title'::text as match_channel,
      td.title_rank as rank_score,
      row_number() over (partition by c.document_id order by c.chunk_index asc) as chunk_position
    from chunks c
    join title_documents td on td.document_id = c.document_id
    where p_jurisdiction_id is null or c.jurisdiction_id = p_jurisdiction_id
  ),
  title_matches as (
    select
      tc.chunk_id,
      tc.document_id,
      tc.content,
      tc.match_channel,
      tc.rank_score
    from title_chunks tc
    order by tc.rank_score desc, tc.chunk_position asc
    limit greatest(p_title_chunk_limit, 0)
  ),
  merged_matches as (
    select * from chunk_matches
    union all
    select * from title_matches
  )
select
  mm.chunk_id,
  mm.document_id,
  mm.content,
  coalesce(r.name, s.title, 'Unknown source') as source_name,
  d.title as document_title,
  d.published_at,
  coalesce(d.source_type, s.source_type) as source_type,
  coalesce(d.raw_url, s.url) as url,
  mm.match_channel,
  mm.rank_score
from merged_matches mm
join documents d on d.id = mm.document_id
join sources s on s.id = d.source_id
join regulators r on r.id = d.regulator_id;
$$;

create or replace function public.retrieve_vector_matches(
  p_query_embedding vector(1536),
  p_jurisdiction_id uuid default null,
  p_candidate_limit integer default 250,
  p_match_count integer default 12,
  p_min_similarity double precision default 0.6
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  source_name text,
  document_title text,
  published_at timestamptz,
  source_type text,
  url text,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
with candidate_pool as (
  select
    c.id as chunk_id,
    c.document_id,
    c.content,
    coalesce(r.name, s.title, 'Unknown source') as source_name,
    d.title as document_title,
    d.published_at,
    coalesce(d.source_type, s.source_type) as source_type,
    coalesce(d.raw_url, s.url) as url,
    (1 - (c.embedding <=> p_query_embedding))::double precision as similarity
  from chunks c
  join documents d on d.id = c.document_id
  join sources s on s.id = d.source_id
  join regulators r on r.id = d.regulator_id
  where c.embedding is not null
    and (p_jurisdiction_id is null or c.jurisdiction_id = p_jurisdiction_id)
  order by c.embedding <=> p_query_embedding
  limit greatest(greatest(p_candidate_limit, p_match_count), 1)
)
select
  cp.chunk_id,
  cp.document_id,
  cp.content,
  cp.source_name,
  cp.document_title,
  cp.published_at,
  cp.source_type,
  cp.url,
  cp.similarity
from candidate_pool cp
where cp.similarity >= p_min_similarity
order by cp.similarity desc
limit greatest(p_match_count, 1);
$$;
