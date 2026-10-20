import { matchSquadPlayer } from "./match-detail-matching";

type Person = { id?: string; name: string } | null;
export type MarkEvent = { type: string; minute: number | null; addedMinute: number | null; club: { id?: string } | null; player: Person; relatedPlayer: Person; playerName?: string | null; relatedPlayerName?: string | null };
export type MarkPlayer = { name: string; fullName?: string | null; playerId: string | null };
/** What happened to one lineup player, for the icons on the pitch and the bench. Minutes are display text ("45+2"). */
export type PlayerMarks = { goals: number; ownGoals: number; assists: number; yellow: string | null; red: string | null; subOff: string | null; subOn: string | null };

const minute = (event: MarkEvent) => event.minute == null ? "" : `${event.minute}${event.addedMinute ? `+${event.addedMinute}` : ""}`;
const empty = (): PlayerMarks => ({ goals: 0, ownGoals: 0, assists: 0, yellow: null, red: null, subOff: null, subOn: null });

/**
 * Attaches a club's events to its lineup players: by canonical player first, else by name (event
 * names and lineup names are often written differently, e.g. "Eric García" and "E. García").
 * An own goal is listed under the benefiting club, so it is looked up in the other lineup.
 */
export function lineupMarks(clubId: string, players: MarkPlayer[], events: MarkEvent[]) {
  const marks = players.map(empty);
  const byName = players.map((player, index) => ({ id: String(index), name: player.fullName || player.name }));
  const byShort = players.map((player, index) => ({ id: String(index), name: player.name }));
  const find = (person: Person, fallback: string | null | undefined) => {
    if (person?.id) { const index = players.findIndex((player) => player.playerId === person.id); if (index >= 0) return index; }
    const name = person?.name ?? fallback;
    if (!name) return -1;
    const hit = matchSquadPlayer(byName, name) ?? matchSquadPlayer(byShort, name) ?? (fallback && fallback !== name ? matchSquadPlayer(byName, fallback) ?? matchSquadPlayer(byShort, fallback) : null);
    return hit === null ? -1 : Number(hit);
  };
  for (const event of events) {
    const own = event.club?.id === clubId;
    if (event.type === "OWN_GOAL") {
      if (own) continue; // the scorer plays for the other club
      const index = find(event.player, event.playerName); if (index >= 0) marks[index].ownGoals++;
      continue;
    }
    if (!own) continue;
    const index = find(event.player, event.playerName);
    if (event.type === "GOAL" || event.type === "PENALTY") {
      if (index >= 0) marks[index].goals++;
      const assist = find(event.relatedPlayer, event.relatedPlayerName); if (assist >= 0) marks[assist].assists++;
    } else if (event.type === "YELLOW_CARD") { if (index >= 0) marks[index].yellow ??= minute(event); }
    else if (event.type === "RED_CARD") { if (index >= 0) marks[index].red ??= minute(event); }
    else if (event.type === "SUBSTITUTION") {
      if (index >= 0) marks[index].subOn ??= minute(event);
      const off = find(event.relatedPlayer, event.relatedPlayerName); if (off >= 0) marks[off].subOff ??= minute(event);
    }
  }
  return marks;
}

/** Rating colour bands like FotMob's: 9+ blue, 7+ green, 6+ orange, below 6 red. */
export function ratingTone(rating: number) {
  return rating >= 9 ? "bg-sky-500 text-white" : rating >= 7 ? "bg-emerald-600 text-white" : rating >= 6 ? "bg-amber-500 text-white" : "bg-rose-600 text-white";
}
/** Average rating of the players who have one (starters and used substitutes), one decimal. */
export function teamRating(ratings: (number | null | undefined)[]) {
  const rated = ratings.filter((rating): rating is number => typeof rating === "number");
  return rated.length ? Math.round((rated.reduce((sum, rating) => sum + rating, 0) / rated.length) * 10) / 10 : null;
}
