import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import type { NormalizedQueryInput, RetrievalPlan } from "../query.types";

const DEFAULT_VECTOR_CANDIDATE_POOL_LIMIT = 250;
const DEFAULT_VECTOR_TOP_K = 12;
const DEFAULT_VECTOR_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_KEYWORD_CHUNK_LIMIT = 24;
const DEFAULT_KEYWORD_TITLE_DOCUMENT_LIMIT = 8;
const DEFAULT_KEYWORD_TITLE_CHUNK_LIMIT = 18;
const DEFAULT_MAX_GROUNDED_ENTRIES = 6;
const JURISDICTION_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedJurisdictionLookup {
  cachedAt: number;
  value: {
    id: string;
    slug: string;
    name: string;
  } | null;
}

const jurisdictionLookupCache = new Map<string, CachedJurisdictionLookup>();

interface JurisdictionPrewarmResult {
  input: string;
  cacheKey: string;
  jurisdictionId: string | null;
  ok: boolean;
  reason: string;
}

function extractKeywordHints(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((word) => word.length >= 3)
        .slice(0, 14)
    )
  );
}

function buildKeywordSearchQuery(normalizedQuery: string, keywordHints: string[]): string {
  const terms = keywordHints.length > 0 ? keywordHints : normalizedQuery.toLowerCase().split(/\s+/g);
  return terms.filter(Boolean).slice(0, 10).join(" ");
}

async function resolveJurisdictionWithCache(jurisdictionInput: string) {
  const cacheKey = jurisdictionInput.trim().toLowerCase();
  const now = Date.now();
  const cached = jurisdictionLookupCache.get(cacheKey);

  if (cached && now - cached.cachedAt <= JURISDICTION_CACHE_TTL_MS) {
    return cached.value;
  }

  const resolved = await queryRetrievalRepository.resolveJurisdiction(jurisdictionInput);
  jurisdictionLookupCache.set(cacheKey, {
    cachedAt: now,
    value: resolved
  });

  return resolved;
}

export async function prewarmJurisdictionLookupCache(
  jurisdictionInputs: string[]
): Promise<JurisdictionPrewarmResult[]> {
  const uniqueInputs = Array.from(
    new Set(
      jurisdictionInputs
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );

  const results: JurisdictionPrewarmResult[] = [];
  for (const input of uniqueInputs) {
    const cacheKey = input.toLowerCase();
    const existing = jurisdictionLookupCache.get(cacheKey);
    const cacheIsFresh =
      existing !== undefined && Date.now() - existing.cachedAt <= JURISDICTION_CACHE_TTL_MS;

    if (cacheIsFresh) {
      results.push({
        input,
        cacheKey,
        jurisdictionId: existing.value?.id ?? null,
        ok: true,
        reason: "cache_hit"
      });
      continue;
    }

    try {
      const resolved = await resolveJurisdictionWithCache(input);
      results.push({
        input,
        cacheKey,
        jurisdictionId: resolved?.id ?? null,
        ok: true,
        reason: resolved ? "warmed" : "not_found"
      });
    } catch (error) {
      results.push({
        input,
        cacheKey,
        jurisdictionId: null,
        ok: false,
        reason: error instanceof Error ? error.message : "unknown_error"
      });
    }
  }

  return results;
}

export async function buildRetrievalPlan(input: NormalizedQueryInput): Promise<RetrievalPlan> {
  const keywordHints = extractKeywordHints(input.query);
  const keywordSearchQuery = buildKeywordSearchQuery(input.query, keywordHints);

  const jurisdictionInput = input.jurisdiction;
  const jurisdictionSlug = jurisdictionInput ? jurisdictionInput.toLowerCase() : null;
  const jurisdictionRecord = jurisdictionInput
    ? await resolveJurisdictionWithCache(jurisdictionInput)
    : null;

  const notes = [
    "Module 1 retrieval plan built from normalized query and retrieval hints.",
    "Vector retrieval is executed only when query embeddings and embedded chunks are available."
  ];

  if (jurisdictionInput && !jurisdictionRecord) {
    notes.push(`Jurisdiction '${jurisdictionInput}' is not currently available in jurisdictions table.`);
  }

  return {
    normalizedQuery: input.query,
    jurisdictionInput,
    jurisdictionSlug,
    jurisdictionId: jurisdictionRecord?.id ?? null,
    keywordHints,
    keywordSearchQuery,
    vectorCandidatePoolLimit: DEFAULT_VECTOR_CANDIDATE_POOL_LIMIT,
    vectorTopK: DEFAULT_VECTOR_TOP_K,
    vectorSimilarityThreshold: DEFAULT_VECTOR_SIMILARITY_THRESHOLD,
    keywordChunkLimit: DEFAULT_KEYWORD_CHUNK_LIMIT,
    keywordTitleDocumentLimit: DEFAULT_KEYWORD_TITLE_DOCUMENT_LIMIT,
    keywordTitleChunkLimit: DEFAULT_KEYWORD_TITLE_CHUNK_LIMIT,
    maxGroundedEntries: DEFAULT_MAX_GROUNDED_ENTRIES,
    notes
  };
}
