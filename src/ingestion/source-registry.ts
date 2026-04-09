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
    maxDocuments: 12
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
    maxDocuments: 12
  },
  {
    slug: "dfsa-rulebook-media-releases",
    title: "DFSA Rulebook Media Releases",
    url: "https://dfsaen.thomsonreuters.com/rulebook/media-releases",
    sourceType: "media_release",
    jurisdictionSlug: "difc",
    regulatorSlug: "dfsa",
    parser: "dfsa_rulebook_media_releases",
    checkMethod: "poll",
    status: "active",
    maxDocuments: 12
  },
  {
    slug: "dfsa-rulebook-past-consultation-papers",
    title: "DFSA Rulebook Past Consultation Papers",
    url: "https://dfsaen.thomsonreuters.com/rulebook/past-papers",
    sourceType: "consultation_paper",
    jurisdictionSlug: "difc",
    regulatorSlug: "dfsa",
    parser: "dfsa_rulebook_consultation_papers",
    checkMethod: "poll",
    status: "active",
    maxDocuments: 12
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
    maxDocuments: 12
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
    maxDocuments: 12
  }
];

export function getSourceRegistry(): IngestionSourceDefinition[] {
  return DEMO_SOURCE_REGISTRY;
}
