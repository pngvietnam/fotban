import { z } from "zod";
import type { MatchProvider, MatchQuery } from "../../types/match-provider";
import { ProviderError } from "../errors";
import { competitionConfig, FOOTBALL_DATA } from "./config";
import { normalizeBatch, normalizeCompetition, normalizeMatch, normalizeScorers, normalizeSeason, normalizeStandings, normalizeTeam } from "./normalization";

type Options = {
  fetch?: typeof fetch; timeoutMs?: number; retries?: number;
  beforeRequest?: () => Promise<void>; onRateLimit?: (delayMs: number) => Promise<void>;
  sleep?: (ms: number) => Promise<void>; random?: () => number;
};

export class FootballDataMatchProvider implements MatchProvider {
  readonly id = FOOTBALL_DATA.id;
  readonly attribution = FOOTBALL_DATA.attribution;
  readonly capabilities = { events: false, advancedStats: false, standings: true, realtime: false };
  #apiKey?: string;
  private readonly options: Options;
  private nextRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(apiKey?: string, options: Options = {}) { this.#apiKey = apiKey?.trim() || undefined; this.options = options; }

  private async request(path: string): Promise<unknown> {
    if (!this.#apiKey) throw new ProviderError("NOT_CONFIGURED");
    const task = this.queue.then(() => this.performRequest(path));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async performRequest(path: string): Promise<unknown> {
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const retries = Math.min(2, Math.max(0, this.options.retries ?? FOOTBALL_DATA.retries));
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (this.options.beforeRequest) await this.options.beforeRequest();
      else {
        await sleep(Math.max(0, this.nextRequestAt - Date.now()));
        this.nextRequestAt = Date.now() + FOOTBALL_DATA.requestIntervalMs;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? FOOTBALL_DATA.timeoutMs);
      let failure: ProviderError;
      try {
        const response = await (this.options.fetch ?? fetch)(`${FOOTBALL_DATA.baseUrl}${path}`, {
          method: "GET", headers: { "X-Auth-Token": this.#apiKey!, Accept: "application/json" },
          signal: controller.signal, redirect: "error", cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) throw new ProviderError("UNAUTHORIZED");
        if (response.status === 429) {
          const header = response.headers.get("Retry-After");
          const seconds = header ? Number(header) : NaN;
          const delay = Number.isFinite(seconds) ? Math.max(60000, seconds * 1000) : Math.max(60000, header ? Date.parse(header) - Date.now() || 60000 : 60000);
          try { await this.options.onRateLimit?.(delay); }
          catch { /* A cooldown-storage outage must not turn 429 into a retried network error. */ }
          throw new ProviderError("RATE_LIMITED", delay);
        }
        if (response.status === 404) throw new ProviderError("UNSUPPORTED");
        if (!response.ok) throw new ProviderError([408, 500, 502, 503, 504].includes(response.status) ? "UPSTREAM" : "UNSUPPORTED");
        const body = await response.text();
        if (body.length > 8 * 1024 * 1024) throw new ProviderError("MALFORMED_RESPONSE");
        try { return JSON.parse(body); } catch { throw new ProviderError("INVALID_JSON"); }
      } catch (error) {
        failure = error instanceof ProviderError ? error : new ProviderError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
      } finally { clearTimeout(timer); }
      if (!["TIMEOUT", "NETWORK", "UPSTREAM"].includes(failure.code) || attempt === retries) throw failure;
      await sleep(500 * 2 ** attempt + Math.floor((this.options.random ?? Math.random)() * 200));
    }
    throw new ProviderError("UPSTREAM");
  }

  private code(competition: string) {
    const config = Object.hasOwn(competitionConfig, competition) ? competitionConfig[competition] : undefined;
    if (!config) throw new ProviderError("UNSUPPORTED");
    return config.code;
  }
  private envelope<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ProviderError("MALFORMED_RESPONSE");
    return parsed.data;
  }
  private seasonQuery(season?: number) {
    if (season !== undefined && (!Number.isInteger(season) || season < 1900 || season > 2200)) throw new ProviderError("UNSUPPORTED");
    return season === undefined ? "" : `?season=${season}`;
  }
  async getCompetitions() {
    const body = this.envelope(z.object({ competitions: z.array(z.unknown()) }), await this.request("/competitions"));
    // Other free competitions are out of this initial product scope, not malformed.
    const wanted = new Set(Object.values(competitionConfig).map((c) => c.code));
    const scoped = body.competitions.filter((c) => typeof c === "object" && c !== null && "code" in c && wanted.has(String(c.code)));
    const result = normalizeBatch(scoped, normalizeCompetition);
    const present = new Set(scoped.map((item) => String((item as { code: unknown }).code)));
    const missing = Math.max(0, wanted.size - present.size);
    if (missing) { result.skipped += missing; result.warnings.push("CONFIGURED_COMPETITIONS_MISSING"); }
    return result;
  }
  async getTeams(competition: string, season?: number) {
    const body = this.envelope(z.object({ competition: z.unknown(), season: z.unknown(), teams: z.array(z.unknown()) }), await this.request(`/competitions/${this.code(competition)}/teams${this.seasonQuery(season)}`));
    const normalized = normalizeCompetition(body.competition).competition;
    if (normalized.key !== competition) throw new ProviderError("MALFORMED_RESPONSE");
    return { competition: normalized, season: normalizeSeason(body.season), teams: normalizeBatch(body.teams, normalizeTeam) };
  }
  async getMatches(query: MatchQuery) {
    const dates = z.object({ dateFrom: z.iso.date(), dateTo: z.iso.date() }).safeParse(query);
    if (!dates.success || query.dateFrom > query.dateTo || Date.parse(query.dateTo) - Date.parse(query.dateFrom) > 31 * 86400000) throw new ProviderError("UNSUPPORTED");
    const params = new URLSearchParams({ dateFrom: query.dateFrom, dateTo: query.dateTo });
    this.seasonQuery(query.season);
    if (query.season !== undefined) params.set("season", String(query.season));
    const body = this.envelope(z.object({ competition: z.unknown().optional(), matches: z.array(z.unknown()) }), await this.request(`/competitions/${this.code(query.competition)}/matches?${params}`));
    return normalizeBatch(body.matches, (item) => {
      const match = normalizeMatch(item, body.competition);
      if (match.competition.key !== query.competition) throw new ProviderError("MALFORMED_RESPONSE");
      return match;
    });
  }
  async getMatch(externalId: string) {
    if (!/^\d+$/.test(externalId)) throw new ProviderError("UNSUPPORTED");
    const match = normalizeMatch(await this.request(`/matches/${externalId}`));
    if (match.externalId !== externalId) throw new ProviderError("MALFORMED_RESPONSE");
    return match;
  }
  async getMatchEvents(_externalId: string) { void _externalId; return { available: false as const, reason: "Detailed events are not a free-tier capability." }; }
  async getMatchStats(_externalId: string) { void _externalId; return { available: false as const, reason: "Advanced statistics are not a free-tier capability." }; }
  /** Top scorers of the current season, with the season's current matchday and the competition emblem. */
  async getScorers(competition: string, limit = 20) {
    return normalizeScorers(await this.request(`/competitions/${this.code(competition)}/scorers?limit=${Math.min(Math.max(limit, 1), 50)}`));
  }
  async getStandings(competition: string, season?: number) {
    const result = normalizeStandings(await this.request(`/competitions/${this.code(competition)}/standings${this.seasonQuery(season)}`));
    if (result.items.some((row) => row.competition.key !== competition)) throw new ProviderError("MALFORMED_RESPONSE");
    return result;
  }
}
