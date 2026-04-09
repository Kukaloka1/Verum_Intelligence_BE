import { queryRetrievalRepository } from "@/repositories/query-retrieval.repository";
import type {
  RetrievalBranchResult,
  RetrievalChunkRecord,
  RetrievalPlan,
  RetrievedChunkCandidate
} from "../query.types";

const KEYWORD_BASE_SCORE = 0.45;
const KEYWORD_TITLE_BOOST = 0.2;
const KEYWORD_TERM_BOOST = 0.07;
const KEYWORD_RANK_BOOST_CAP = 0.2;

function buildExcerpt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= 320) {
    return compact;
  }

  return `${compact.slice(0, 317)}...`;
}

function findMatchedTerms(hints: string[], text: string): string[] {
  const normalized = text.toLowerCase();
  return hints.filter((hint) => normalized.includes(hint));
}

function computeKeywordScore(
  record: RetrievalChunkRecord,
  keywordHints: string[],
  titleMatch: boolean,
  rankScore: number
): number {
  const text = `${record.documentTitle} ${record.content}`;
  const matchedTerms = findMatchedTerms(keywordHints, text);
  const termBoost = Math.min(matchedTerms.length * KEYWORD_TERM_BOOST, 0.35);
  const titleBoost = titleMatch ? KEYWORD_TITLE_BOOST : 0;
  const normalizedRank = Math.max(rankScore, 0);
  const rankBoost = Math.min(normalizedRank * 0.15, KEYWORD_RANK_BOOST_CAP);

  return Math.min(KEYWORD_BASE_SCORE + termBoost + titleBoost + rankBoost, 0.99);
}

function toKeywordCandidate(
  record: RetrievalChunkRecord,
  plan: RetrievalPlan,
  titleMatch: boolean,
  rankScore: number
): RetrievedChunkCandidate {
  const matchedTerms = findMatchedTerms(plan.keywordHints, `${record.documentTitle} ${record.content}`);

  return {
    chunkId: record.chunkId,
    documentId: record.documentId,
    score: computeKeywordScore(record, plan.keywordHints, titleMatch, rankScore),
    excerpt: buildExcerpt(record.content),
    sourceName: record.sourceName,
    documentTitle: record.documentTitle,
    publishedAt: record.publishedAt,
    sourceType: record.sourceType,
    url: record.url,
    method: "keyword",
    matchedTerms
  };
}

export async function retrieveByKeyword(plan: RetrievalPlan): Promise<RetrievalBranchResult> {
  if (!plan.keywordSearchQuery.trim()) {
    return {
      method: "keyword",
      items: [],
      deferred: false,
      reason: "Keyword retrieval skipped because query terms were empty after normalization."
    };
  }

  const keywordMatches = await queryRetrievalRepository.fetchKeywordMatchedChunks(plan.keywordSearchQuery, {
    jurisdictionId: plan.jurisdictionId,
    chunkLimit: plan.keywordChunkLimit,
    titleDocumentLimit: plan.keywordTitleDocumentLimit,
    titleChunkLimit: plan.keywordTitleChunkLimit
  });

  const chunkCandidates = keywordMatches
    .filter((record) => record.matchChannel === "chunk")
    .map((record) => toKeywordCandidate(record, plan, false, record.rankScore));
  const titleCandidates = keywordMatches
    .filter((record) => record.matchChannel === "title")
    .map((record) => toKeywordCandidate(record, plan, true, record.rankScore));

  return {
    method: "keyword",
    items: [...chunkCandidates, ...titleCandidates],
    deferred: false,
    reason: `Keyword retrieval executed with ${chunkCandidates.length} chunk match(es) and ${titleCandidates.length} title-driven chunk match(es) via single SQL path.`
  };
}
