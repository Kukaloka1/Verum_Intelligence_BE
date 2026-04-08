import type { IngestionSourceDefinition } from "./ingestion.types";

const DEMO_SOURCE_REGISTRY: IngestionSourceDefinition[] = [
  {
    slug: "dfsa-news",
    title: "DFSA News",
    url: "https://www.dfsa.ae/news",
    sourceType: "news",
    jurisdictionSlug: "difc",
    regulatorSlug: "dfsa",
    parser: "dfsa_news_listing",
    checkMethod: "poll",
    status: "active",
    maxDocuments: 4
  },
  {
    slug: "dfsa-alerts",
    title: "DFSA Alerts",
    url: "https://www.dfsa.ae/alerts",
    sourceType: "alert",
    jurisdictionSlug: "difc",
    regulatorSlug: "dfsa",
    parser: "dfsa_alert_listing",
    checkMethod: "poll",
    status: "active",
    maxDocuments: 4
  },
  {
    slug: "adgm-fsra-guidance",
    title: "ADGM FSRA Guidance and Policy Statements",
    url: "https://www.adgm.com/legal-framework/guidance-and-policy-statements",
    sourceType: "guidance",
    jurisdictionSlug: "adgm",
    regulatorSlug: "fsra",
    parser: "adgm_fsra_guidance",
    checkMethod: "poll",
    status: "active",
    maxDocuments: 4
  },
  {
    slug: "adgm-fsra-public-consultations",
    title: "ADGM FSRA Public Consultations",
    url: "https://www.adgm.com/legal-framework/public-consultations",
    sourceType: "consultation_paper",
    jurisdictionSlug: "adgm",
    regulatorSlug: "fsra",
    parser: "adgm_fsra_consultations",
    checkMethod: "poll",
    status: "active",
    maxDocuments: 4
  }
];

export function getSourceRegistry(): IngestionSourceDefinition[] {
  return DEMO_SOURCE_REGISTRY;
}
