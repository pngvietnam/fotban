/** Name matching between football-data clubs/players and a detail provider's names. Pure and deterministic. */

const fillers = new Set(["fc", "cf", "afc", "sc", "ac", "cd", "ud", "rc", "rcd", "sd", "club", "de", "del", "the", "and", "football", "futbol", "calcio", "1", "sv", "fk", "sk", "as", "ss", "ssc", "vfb", "vfl", "tsg", "bv", "ca"]);
export const foldName = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/ø/g, "o").replace(/ß/g, "ss");
const tokens = (value: string) => new Set(foldName(value).split(/[^a-z0-9]+/).filter((token) => token && !fillers.has(token)));

/** Best overlap between any of a club's names and the provider's team name: 1 = all tokens of the shorter name shared. */
export function teamNameScore(names: (string | null | undefined)[], candidate: string) {
  const other = tokens(candidate);
  let best = 0;
  for (const name of names) {
    if (!name?.trim()) continue;
    const own = tokens(name);
    if (!own.size || !other.size) continue;
    const shared = [...own].filter((token) => other.has(token)).length;
    best = Math.max(best, shared / Math.min(own.size, other.size));
  }
  return best;
}

export type LocalMatch = { id: string; kickoffAt: Date; home: (string | null)[]; away: (string | null)[] };
export type RemoteMatch = { id: string; kickoffAt: Date; home: { name: string }; away: { name: string } };
/**
 * Pairs local matches with provider matches of the same competition and day: kickoff within
 * 20 minutes, and both team names must agree (each score ≥ 0.5, total ≥ 1.5). A provider match is
 * used once; ties between two candidates leave the local match unmatched rather than guess.
 */
export function pairMatches(local: LocalMatch[], remote: RemoteMatch[]) {
  const used = new Set<string>(); const pairs = new Map<string, string>();
  for (const match of local) {
    const scored = remote.filter((item) => !used.has(item.id) && Math.abs(item.kickoffAt.getTime() - match.kickoffAt.getTime()) <= 20 * 60_000)
      .map((item) => ({ item, home: teamNameScore(match.home, item.home.name), away: teamNameScore(match.away, item.away.name) }))
      .filter((entry) => entry.home >= 0.5 && entry.away >= 0.5 && entry.home + entry.away >= 1.5)
      .sort((a, b) => (b.home + b.away) - (a.home + a.away));
    if (!scored.length || (scored[1] && scored[1].home + scored[1].away === scored[0].home + scored[0].away)) continue;
    used.add(scored[0].item.id); pairs.set(match.id, scored[0].item.id);
  }
  return pairs;
}

export type SquadPlayer = { id: string; name: string };
/**
 * The squad player a provider name refers to, or null when unsure: an exact full name, else
 * "M. Salah" / "Salah" style names by surname (and first initial when given), only when unique.
 */
export function matchSquadPlayer(squad: SquadPlayer[], name: string | null) {
  if (!name?.trim()) return null;
  const words = (value: string) => foldName(value).split(/[^a-z0-9]+/).filter(Boolean);
  const wanted = words(name);
  if (!wanted.length) return null;
  const exact = squad.filter((player) => words(player.name).join(" ") === wanted.join(" "));
  if (exact.length === 1) return exact[0].id;
  const initial = /^\s*\p{L}\.\s*/u.test(name) ? wanted[0][0] : null;
  const surname = wanted.slice(initial ? 1 : 0).join(" ");
  if (!surname) return null;
  const bySurname = squad.filter((player) => {
    const own = words(player.name);
    for (let start = 1; start < own.length; start++) if (own.slice(start).join(" ") === surname) return !initial || own[0][0] === initial;
    return own.length === 1 && own[0] === surname && !initial;
  });
  if (bySurname.length === 1) return bySurname[0].id;
  if (initial) return null;
  // Longer or shorter forms of the same name: "Lamine Yamal" and "Lamine Yamal Nasraoui Ebana".
  const wantedSet = new Set(wanted);
  const nested = squad.filter((player) => {
    const own = words(player.name);
    const shorter = own.length <= wanted.length ? own : wanted; const longer = new Set(own.length <= wanted.length ? wanted : own);
    return shorter.length >= 2 && shorter.every((word) => longer.has(word)) && own.some((word) => wantedSet.has(word));
  });
  return nested.length === 1 ? nested[0].id : null;
}
