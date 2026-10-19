export const wikinewsConfig = {
  slug: "wikinews-en", name: "Wikinews (English)", domain: "en.wikinews.org", language: "en",
  endpoint: "https://en.wikinews.org/w/api.php",
  policyTitle: "Wikinews:Copyright", policyUrl: "https://en.wikinews.org/wiki/Wikinews:Copyright",
  // Football scope remains EPL/La Liga. Archived reporting is not represented as current news.
  search: 'incategory:Published ("English Premier League" OR "La Liga" OR "Liverpool FC" OR "FC Barcelona")',
} as const;
