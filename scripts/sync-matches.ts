import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createLogger } from "../lib/logging";
import { createMatchRuntime } from "../lib/match-runtime";
import { competitionConfig } from "../providers/football-data/config";
import { ProviderError, safeProviderError } from "../providers/errors";
import { syncMatches, type SyncRequest } from "../services/match-sync";

async function main() {
  const env = parseEnvironment(process.env);
  const args = process.argv.slice(2);
  const mode = args[0];
  const help = "Usage: npm.cmd run provider:sync -- competitions | teams PL|PD | matches PL|PD [--from YYYY-MM-DD --to YYYY-MM-DD --season YYYY --force] | standings PL|PD | smoke";
  if (!["competitions", "teams", "matches", "standings", "smoke"].includes(mode)) { console.error(help); process.exitCode = 1; return; }
  const options = args.slice(mode === "competitions" || mode === "smoke" ? 1 : 2);
  const values: Record<string, string> = {};
  let force = false;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === "--force") force = true;
    else if (["--from", "--to", "--season"].includes(options[i]) && options[i + 1] && !options[i + 1].startsWith("--")) values[options[i]] = options[++i];
    else { console.error(help); process.exitCode = 1; return; }
  }
  // Do not require database availability merely to report a missing provider key.
  if (!env.FOOTBALL_DATA_API_KEY) throw new ProviderError("NOT_CONFIGURED");
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required for provider sync."); process.exitCode = 1; return; }
  const resolve = (code: string) => {
    const entry = Object.entries(competitionConfig).find(([key, config]) => config.code === code || key === code);
    if (!entry) throw new ProviderError("UNSUPPORTED");
    return entry[0];
  };
  const today = new Date();
  const dateFrom = values["--from"] ?? new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const dateTo = values["--to"] ?? new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const season = values["--season"] === undefined ? undefined : Number(values["--season"]);
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const { provider, store } = createMatchRuntime(db, env);
    const logger = createLogger(env.LOG_LEVEL);
    const run = async (request: SyncRequest) => {
      const result = await syncMatches(provider, store, request, logger);
      console.log(JSON.stringify({ mode: request.mode, competition: "competition" in request ? request.competition : undefined, ...result }));
      if (result.skipped) process.exitCode = 1; // Partial data requires operator attention.
      return result;
    };
    if (mode === "smoke") {
      // Only one date-bounded matches call per configured competition (2 calls).
      // A fresh existing cache is reused; do not bypass it automatically.
      for (const competition of Object.keys(competitionConfig)) {
        await run({ mode: "matches", competition, dateFrom, dateTo, season, force });
        const persistedMatches = await db.match.count({ where: { provider: provider.id, league: { slug: competition }, kickoffAt: { gte: new Date(`${dateFrom}T00:00:00Z`), lt: new Date(Date.parse(`${dateTo}T00:00:00Z`) + 86400000) } } });
        console.log(JSON.stringify({ competition, persistedMatchesInWindow: persistedMatches }));
        if (persistedMatches === 0) { console.error("No matches in the selected window; live match persistence is not verified for this competition."); process.exitCode = 1; }
      }
      const summary = await db.match.groupBy({ by: ["leagueId"], where: { provider: provider.id }, _count: { id: true } });
      console.log(JSON.stringify({ persistedCompetitionCount: summary.length, persistedMatchCount: summary.reduce((sum, group) => sum + group._count.id, 0) }));
    } else if (mode === "competitions") await run({ mode, force });
    else if (mode === "matches") await run({ mode, competition: resolve(args[1]), dateFrom, dateTo, season, force });
    else if (mode === "teams") await run({ mode, competition: resolve(args[1]), season, force });
    else await run({ mode: "standings", competition: resolve(args[1]), season, force });
  } finally { await db.$disconnect(); }
}

main().catch((error) => {
  const safe = safeProviderError(error);
  console.error(`${safe.code}: ${safe.message}`);
  process.exitCode = 1;
});
