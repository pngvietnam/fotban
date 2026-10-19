/** Club crest links come from the data provider and are shown by the reader's browser only (never downloaded
 * or stored by FotBan). Only the provider's own crest host is accepted, whatever is stored in the database. */
const crestHosts = new Set(["crests.football-data.org"]);
export function safeCrestUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && crestHosts.has(url.hostname) && !url.username && !url.password && !url.port && /^\/[A-Za-z0-9._-]+\.(?:png|svg)$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
