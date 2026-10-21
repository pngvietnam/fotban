import type { SqlExecutor } from "../lib/sync-database";
import type { FollowedEntity } from "./following";

const kinds = { C: "CLUB", P: "PLAYER", L: "COMPETITION" } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const guestFollowCookie = "fotban-follows";
const maxGuestFollows = 40;

/** A guest's follows arrive as ids in a cookie ("C.<uuid>|P.<uuid>|L.<uuid>"); anything malformed is dropped. */
export function parseGuestFollowCookie(value: string | undefined): { type: FollowedEntity["type"]; entityId: string }[] {
  if (!value) return [];
  const seen = new Set<string>();
  return value.split("|").slice(0, maxGuestFollows).flatMap((part) => {
    const [kind, id] = part.split(".");
    const type = kinds[kind as keyof typeof kinds];
    if (!type || !id || !uuid.test(id) || seen.has(`${type}:${id.toLowerCase()}`)) return [];
    seen.add(`${type}:${id.toLowerCase()}`); return [{ type, entityId: id.toLowerCase() }];
  });
}

/** Names and crests for a guest's followed ids, read from the database; ids that no longer exist are skipped. */
export async function resolveGuestFollows(tx: SqlExecutor, targets: ReturnType<typeof parseGuestFollowCookie>): Promise<FollowedEntity[]> {
  if (!targets.length) return [];
  const ids = (type: FollowedEntity["type"]) => targets.filter((target) => target.type === type).map((target) => target.entityId);
  const [clubs, players, leagues] = await Promise.all([
    tx.query<{ id: string; name: string; crest: string | null }>('SELECT id,name,"externalCrestUrl" AS crest FROM "Club" WHERE id=ANY($1::uuid[])', [ids("CLUB")]),
    tx.query<{ id: string; name: string }>('SELECT id,name FROM "Player" WHERE id=ANY($1::uuid[])', [ids("PLAYER")]),
    tx.query<{ id: string; name: string }>(`SELECT id,name FROM "League" WHERE id=ANY($1::uuid[]) AND slug IN ('premier-league','la-liga','ligue-1','champions-league')`, [ids("COMPETITION")]),
  ]);
  const byId = new Map<string, FollowedEntity>([
    ...clubs.map((row): [string, FollowedEntity] => [row.id, { type: "CLUB", entityId: row.id, name: row.name, crestUrl: row.crest, following: true }]),
    ...players.map((row): [string, FollowedEntity] => [row.id, { type: "PLAYER", entityId: row.id, name: row.name, following: true }]),
    ...leagues.map((row): [string, FollowedEntity] => [row.id, { type: "COMPETITION", entityId: row.id, name: row.name, following: true }]),
  ]);
  return targets.flatMap((target) => byId.get(target.entityId) ?? []);
}
