export const developmentLeagues = [
  { slug: "premier-league", name: "Premier League", country: "England" },
  { slug: "la-liga", name: "La Liga", country: "Spain" },
] as const;

export function assertDevelopmentSeed(input: {
  nodeEnv?: string;
  allow?: string;
  databaseUrl?: string;
}) {
  if (input.nodeEnv === "production" || input.allow !== "true" || !input.databaseUrl) {
    throw new Error("Development seed requires ALLOW_DEV_SEED=true and a local development database.");
  }
  const url = new URL(input.databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== "/football_morning") {
    throw new Error("Development seed is restricted to the local football_morning database.");
  }
}
