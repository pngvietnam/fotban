import type { NewsSourceConfig } from "../../types/news-provider";
import { vietnameseSource } from "./vietnamese-sources";
import { publisherFeedAllowed } from "../../lib/publisher-feed-permission";

export type SourceDefinition = {
  slug: string; name: string; domain: string; language: string; country: string;
  endpoint: string; articlePath: RegExp; termsUrl: string; restriction: string;
  linkSelector: string; titleSelector: string; cardSelector: string;
};
// Candidate adapters, NOT a grant of rights. Registration is always disabled.
export const officialNewsSources: SourceDefinition[] = [
  { slug: "premier-league", name: "Premier League", domain: "www.premierleague.com", language: "en", country: "GB", endpoint: "https://www.premierleague.com/en/news", articlePath: /^\/en\/news\/[0-9]+(?:\/|$)/, termsUrl: "https://www.premierleague.com/en/terms-and-conditions", restriction: "Prior written approval required for database reuse and deep-linking; no permission supplied.", linkSelector: 'a[href*="/en/news/"]', titleSelector: 'h2,h3,[class*="title"]', cardSelector: 'article,li,[class*="card"],[class*="Card"]' },
  { slug: "la-liga", name: "LALIGA", domain: "www.laliga.com", language: "en", country: "ES", endpoint: "https://www.laliga.com/en-GB/news", articlePath: /^\/en-GB\/news\/.+/, termsUrl: "https://www.laliga.com/en-GB/legal/legal-web", restriction: "Personal/non-commercial content licence; no production ingestion permission supplied.", linkSelector: 'a[href*="/en-GB/news/"]', titleSelector: 'h2,h3,[class*="title"]', cardSelector: 'article,li,[class*="card"],[class*="Card"]' },
  { slug: "liverpool", name: "Liverpool FC", domain: "www.liverpoolfc.com", language: "en", country: "GB", endpoint: "https://www.liverpoolfc.com/news", articlePath: /^\/news\/.+/, termsUrl: "https://www.liverpoolfc.com/legal", restriction: "Website content rights and automated ingestion scope require review/permission; no permission supplied.", linkSelector: 'a[href*="/news/"]', titleSelector: 'h2,h3,[class*="title"]', cardSelector: 'article,li,[class*="card"],[class*="Card"]' },
  { slug: "barcelona", name: "FC Barcelona", domain: "www.fcbarcelona.com", language: "en", country: "ES", endpoint: "https://www.fcbarcelona.com/en/football/first-team/news", articlePath: /^\/en\/(?:football\/first-team\/)?news\/[0-9]+(?:\/|$)/, termsUrl: "https://www.fcbarcelona.com/en/legal-notices", restriction: "Reuse and automated ingestion permission not established; review required.", linkSelector: 'a[href*="/news/"]', titleSelector: 'h2,h3,[class*="title"]', cardSelector: 'article,li,[class*="card"],[class*="Card"]' },
];
export function canIngest(source: NewsSourceConfig) {
  if (vietnameseSource(source.slug) && !publisherFeedAllowed(source)) return false;
  return source.enabled && source.termsReviewed && source.ingestionAllowed && source.permissionStatus === "ALLOWED" && Boolean(source.reviewedAt && source.reviewer?.trim() && source.permissionReference?.trim());
}
export const definitionFor = (slug: string) => officialNewsSources.find((source) => source.slug === slug);
