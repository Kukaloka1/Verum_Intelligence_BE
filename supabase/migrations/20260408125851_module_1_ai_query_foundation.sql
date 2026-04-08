-- Module 1 foundation: AI Query Interface
-- Source of truth: verum_FE/docs/DB_SUPABASE.md

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists jurisdictions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists regulators (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references jurisdictions(id) on delete restrict,
  slug text not null,
  name text not null,
  official_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (jurisdiction_id, slug)
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  regulator_id uuid not null references regulators(id) on delete restrict,
  jurisdiction_id uuid not null references jurisdictions(id) on delete restrict,
  slug text not null,
  source_type text not null,
  title text not null,
  url text not null,
  rss_url text,
  check_method text not null default 'poll',
  status text not null default 'active',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (regulator_id, slug)
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete restrict,
  jurisdiction_id uuid not null references jurisdictions(id) on delete restrict,
  regulator_id uuid not null references regulators(id) on delete restrict,
  slug text not null,
  title text not null,
  source_type text not null,
  published_at timestamptz,
  effective_at timestamptz,
  raw_url text not null,
  normalized_status text not null default 'active',
  summary text,
  hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (regulator_id, slug),
  unique (hash)
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_hash text not null,
  content_snapshot text not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (document_id, version_hash)
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  document_version_id uuid not null references document_versions(id) on delete cascade,
  jurisdiction_id uuid not null references jurisdictions(id) on delete restrict,
  regulator_id uuid not null references regulators(id) on delete restrict,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (document_version_id, chunk_index)
);

create table if not exists saved_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  query_text text not null,
  jurisdiction_id uuid references jurisdictions(id) on delete set null,
  answer_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists query_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  query_text text not null,
  jurisdiction_id uuid references jurisdictions(id) on delete set null,
  retrieval_metadata jsonb not null default '{}'::jsonb,
  sources_used integer not null default 0,
  result_status text not null default 'success',
  created_at timestamptz not null default now()
);

create table if not exists query_citations (
  id uuid primary key default gen_random_uuid(),
  query_log_id uuid not null references query_logs(id) on delete cascade,
  chunk_id uuid references chunks(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  citation_order integer not null,
  source_name text not null,
  document_title text not null,
  published_at timestamptz,
  source_type text,
  url text,
  created_at timestamptz not null default now()
);

alter table chunks
add column if not exists search_vector tsvector
generated always as (
  to_tsvector('english', coalesce(content, ''))
) stored;

create index if not exists idx_chunks_search_vector
on chunks using gin(search_vector);

alter table documents
add column if not exists title_search_vector tsvector
generated always as (
  to_tsvector('english', coalesce(title, ''))
) stored;

create index if not exists idx_documents_title_search_vector
on documents using gin(title_search_vector);

create index if not exists idx_regulators_jurisdiction_id on regulators(jurisdiction_id);
create index if not exists idx_sources_regulator_id on sources(regulator_id);
create index if not exists idx_sources_jurisdiction_id on sources(jurisdiction_id);
create index if not exists idx_documents_jurisdiction_id on documents(jurisdiction_id);
create index if not exists idx_documents_regulator_id on documents(regulator_id);
create index if not exists idx_documents_source_type on documents(source_type);
create index if not exists idx_documents_published_at on documents(published_at desc);
create index if not exists idx_document_versions_document_id on document_versions(document_id);
create index if not exists idx_chunks_document_id on chunks(document_id);
create index if not exists idx_chunks_jurisdiction_id on chunks(jurisdiction_id);
create index if not exists idx_chunks_regulator_id on chunks(regulator_id);
create index if not exists idx_saved_queries_user_id on saved_queries(user_id);
create index if not exists idx_query_logs_user_id on query_logs(user_id);
create index if not exists idx_query_logs_jurisdiction_id on query_logs(jurisdiction_id);
create index if not exists idx_query_citations_query_log_id on query_citations(query_log_id);

insert into jurisdictions (slug, name, status)
values
  ('difc', 'DIFC', 'active'),
  ('adgm', 'ADGM', 'active')
on conflict (slug) do update
set
  name = excluded.name,
  status = excluded.status;

insert into regulators (jurisdiction_id, slug, name, official_url, status)
select j.id, 'dfsa', 'DFSA', 'https://www.dfsa.ae', 'active'
from jurisdictions j
where j.slug = 'difc'
on conflict (jurisdiction_id, slug) do update
set
  name = excluded.name,
  official_url = excluded.official_url,
  status = excluded.status;

insert into regulators (jurisdiction_id, slug, name, official_url, status)
select j.id, 'fsra', 'FSRA', 'https://www.adgm.com/operating-in-adgm/financial-services-regulatory-authority', 'active'
from jurisdictions j
where j.slug = 'adgm'
on conflict (jurisdiction_id, slug) do update
set
  name = excluded.name,
  official_url = excluded.official_url,
  status = excluded.status;
