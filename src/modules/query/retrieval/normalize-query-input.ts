import type { NormalizedQueryInput, QueryRequestBody } from "../query.types";

function normalizeOptionalField(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeQueryInput(input: QueryRequestBody): NormalizedQueryInput {
  const normalizedQuery = input.query.trim().replace(/\s+/g, " ");
  const normalizedJurisdiction = normalizeOptionalField(input.jurisdiction)?.toUpperCase() ?? null;
  const normalizedUserId = normalizeOptionalField(input.userId);

  return {
    query: normalizedQuery,
    jurisdiction: normalizedJurisdiction,
    userId: normalizedUserId,
    saveQuery: Boolean(input.saveQuery)
  };
}
