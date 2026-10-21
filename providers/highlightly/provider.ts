import { ProviderError } from "../errors";
import { HIGHLIGHTLY } from "./config";
import { normalizePlayerProfile, normalizePlayerSearch, normalizeBoxScore, normalizeDetail, normalizeLeagues, normalizeLineups, normalizeMatches, type HighlightlyBoxScore, type HighlightlyDetail, type HighlightlyLeague, type HighlightlyLineups, type HighlightlyMatch } from "./normalization";

/** What the match-detail sync needs from a detail provider; tests pass a fake. */
/** Player lookups for the transfer pages (profile: transfers with fees, market value, contract, injuries). */
export type PlayerProfileApi = {
  searchPlayers(name: string): Promise<{ id: string; name: string; fullName: string | null }[]>;
  playerProfile(id: string): Promise<ReturnType<typeof normalizePlayerProfile>>;
};
export type MatchDetailApi = {
  leagues(name: string): Promise<HighlightlyLeague[]>;
  matches(query: { leagueId: string; date: string }): Promise<HighlightlyMatch[]>;
  match(id: string): Promise<HighlightlyDetail>;
  /** null when the provider has no lineups for the match yet. */
  lineups(id: string): Promise<HighlightlyLineups | null>;
  /** Per-player ratings, minutes and figures of a finished match. */
  boxScore(id: string): Promise<HighlightlyBoxScore>;
};
type Options = {
  fetch?: typeof fetch;
  /** Called before every request; throws (e.g. RATE_LIMITED) to stop when the daily allowance is spent. */
  beforeRequest?: () => Promise<void>;
  /** Called on HTTP 429 so the caller can stop for the rest of the day. */
  onRateLimit?: () => Promise<void>;
  timeoutMs?: number;
};

/**
 * Highlightly football API (free Basic plan). Every request counts against a small daily allowance,
 * so there are no automatic retries: a failed read is retried by a later worker pass.
 */
export class HighlightlyProvider implements MatchDetailApi, PlayerProfileApi {
  #apiKey?: string;
  constructor(apiKey: string | undefined, private options: Options = {}) { this.#apiKey = apiKey?.trim() || undefined; }

  private async request(path: string, params: Record<string, string> = {}): Promise<unknown> {
    if (!this.#apiKey) throw new ProviderError("NOT_CONFIGURED");
    await this.options.beforeRequest?.();
    const query = new URLSearchParams(params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? HIGHLIGHTLY.timeoutMs);
    try {
      const response = await (this.options.fetch ?? fetch)(`${HIGHLIGHTLY.baseUrl}${path}${query.size ? `?${query}` : ""}`, {
        method: "GET", headers: { "x-rapidapi-key": this.#apiKey, Accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) throw new ProviderError("UNAUTHORIZED");
      if (response.status === 429) { try { await this.options.onRateLimit?.(); } catch { /* Keep the 429 as the reported error. */ } throw new ProviderError("RATE_LIMITED"); }
      if (response.status === 404) throw new ProviderError("UNSUPPORTED");
      if (!response.ok) throw new ProviderError(response.status >= 500 || response.status === 408 ? "UPSTREAM" : "UNSUPPORTED");
      const body = await response.text();
      if (body.length > 8 * 1024 * 1024) throw new ProviderError("MALFORMED_RESPONSE");
      try { return JSON.parse(body); } catch { throw new ProviderError("INVALID_JSON"); }
    } catch (error) {
      throw error instanceof ProviderError ? error : new ProviderError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
    } finally { clearTimeout(timer); }
  }
  private parse<T>(read: () => T): T {
    try { return read(); } catch { throw new ProviderError("MALFORMED_RESPONSE"); }
  }
  async leagues(name: string) { const body = await this.request("/leagues", { leagueName: name }); return this.parse(() => normalizeLeagues(body)); }
  async matches(query: { leagueId: string; date: string }) { const body = await this.request("/matches", { leagueId: query.leagueId, date: query.date, timezone: "Etc/UTC" }); return this.parse(() => normalizeMatches(body)); }
  async searchPlayers(name: string) { const body = await this.request("/players", { name, limit: "10" }); return this.parse(() => normalizePlayerSearch(body)); }
  async playerProfile(id: string) {
    if (!/^\d{1,20}$/.test(id)) throw new ProviderError("UNSUPPORTED");
    const body = await this.request(`/players/${id}`);
    return this.parse(() => normalizePlayerProfile(body));
  }
  async match(id: string) {
    if (!/^\d{1,20}$/.test(id)) throw new ProviderError("UNSUPPORTED");
    const body = await this.request(`/matches/${id}`);
    return this.parse(() => normalizeDetail(body));
  }
  async boxScore(id: string) {
    if (!/^\d{1,20}$/.test(id)) throw new ProviderError("UNSUPPORTED");
    const body = await this.request(`/box-score/${id}`);
    return this.parse(() => normalizeBoxScore(body));
  }
  async lineups(id: string) {
    if (!/^\d{1,20}$/.test(id)) throw new ProviderError("UNSUPPORTED");
    let body: unknown;
    try { body = await this.request(`/lineups/${id}`); } catch (error) { if (error instanceof ProviderError && error.code === "UNSUPPORTED") return null; throw error; }
    const lineups = this.parse(() => normalizeLineups(body));
    return lineups.home.players.some((player) => player.starter) || lineups.away.players.some((player) => player.starter) ? lineups : null;
  }
}
