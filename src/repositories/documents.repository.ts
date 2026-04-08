import { getDbClient } from "@/db/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/db/database.types";

export interface JurisdictionLookup {
  id: string;
  slug: string;
  name: string;
}

export interface RegulatorLookup {
  id: string;
  slug: string;
  name: string;
  jurisdictionId: string;
}

export interface UpsertSourceInput {
  regulatorId: string;
  jurisdictionId: string;
  slug: string;
  sourceType: string;
  title: string;
  url: string;
  checkMethod: string;
  status: string;
}

export interface UpsertDocumentInput {
  sourceId: string;
  jurisdictionId: string;
  regulatorId: string;
  slug: string;
  title: string;
  sourceType: string;
  publishedAtIso: string | null;
  effectiveAtIso: string | null;
  rawUrl: string;
  summary: string | null;
  hash: string;
  normalizedStatus: string;
}

export interface UpsertDocumentVersionInput {
  documentId: string;
  versionHash: string;
  contentSnapshot: string;
  fetchedAtIso: string;
}

export interface StoredDocumentVersion {
  id: string;
  inserted: boolean;
}

export interface DocumentSample {
  id: string;
  title: string;
  rawUrl: string;
  publishedAt: string | null;
}

async function resolveJurisdictionBySlug(slug: string): Promise<JurisdictionLookup | null> {
  const db = getDbClient();
  const { data, error } = await db
    .from("jurisdictions")
    .select("id, slug, name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`Jurisdiction lookup failed for '${slug}': ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name
  };
}

async function resolveRegulatorBySlug(
  jurisdictionId: string,
  slug: string
): Promise<RegulatorLookup | null> {
  const db = getDbClient();
  const { data, error } = await db
    .from("regulators")
    .select("id, slug, name, jurisdiction_id")
    .eq("jurisdiction_id", jurisdictionId)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`Regulator lookup failed for '${slug}': ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    jurisdictionId: data.jurisdiction_id
  };
}

async function upsertSource(input: UpsertSourceInput): Promise<Tables<"sources">> {
  const db = getDbClient();
  const payload: TablesInsert<"sources"> = {
    regulator_id: input.regulatorId,
    jurisdiction_id: input.jurisdictionId,
    slug: input.slug,
    source_type: input.sourceType,
    title: input.title,
    url: input.url,
    check_method: input.checkMethod,
    status: input.status,
    last_checked_at: new Date().toISOString()
  };

  const { data, error } = await db
    .from("sources")
    .upsert(payload, {
      onConflict: "regulator_id,slug"
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Source upsert failed for '${input.slug}': ${error.message}`);
  }

  return data;
}

async function upsertDocument(input: UpsertDocumentInput): Promise<Tables<"documents">> {
  const db = getDbClient();

  const payload: TablesInsert<"documents"> = {
    source_id: input.sourceId,
    jurisdiction_id: input.jurisdictionId,
    regulator_id: input.regulatorId,
    slug: input.slug,
    title: input.title,
    source_type: input.sourceType,
    published_at: input.publishedAtIso,
    effective_at: input.effectiveAtIso,
    raw_url: input.rawUrl,
    summary: input.summary,
    hash: input.hash,
    normalized_status: input.normalizedStatus
  };

  const { data, error } = await db
    .from("documents")
    .upsert(payload, {
      onConflict: "regulator_id,slug"
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Document upsert failed for '${input.slug}': ${error.message}`);
  }

  return data;
}

async function upsertDocumentVersion(input: UpsertDocumentVersionInput): Promise<StoredDocumentVersion> {
  const db = getDbClient();

  const { data: existing, error: existingError } = await db
    .from("document_versions")
    .select("id")
    .eq("document_id", input.documentId)
    .eq("version_hash", input.versionHash)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Document version lookup failed: ${existingError.message}`);
  }

  if (existing) {
    return {
      id: existing.id,
      inserted: false
    };
  }

  const payload: TablesInsert<"document_versions"> = {
    document_id: input.documentId,
    version_hash: input.versionHash,
    content_snapshot: input.contentSnapshot,
    fetched_at: input.fetchedAtIso
  };

  const { data: inserted, error: insertError } = await db
    .from("document_versions")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Document version insert failed: ${insertError.message}`);
  }

  return {
    id: inserted.id,
    inserted: true
  };
}

async function markSourceChecked(sourceId: string): Promise<void> {
  const db = getDbClient();

  const patch: TablesUpdate<"sources"> = {
    last_checked_at: new Date().toISOString()
  };

  const { error } = await db.from("sources").update(patch).eq("id", sourceId);

  if (error) {
    throw new Error(`Source check timestamp update failed: ${error.message}`);
  }
}

async function listRecentDocumentSamples(limit: number): Promise<DocumentSample[]> {
  const db = getDbClient();
  const { data, error } = await db
    .from("documents")
    .select("id, title, raw_url, published_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Document sample query failed: ${error.message}`);
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    rawUrl: item.raw_url,
    publishedAt: item.published_at
  }));
}

export const documentsRepository = {
  resolveJurisdictionBySlug,
  resolveRegulatorBySlug,
  upsertSource,
  upsertDocument,
  upsertDocumentVersion,
  markSourceChecked,
  listRecentDocumentSamples
};
