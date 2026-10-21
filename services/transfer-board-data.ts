import "server-only";
import { cache } from "react";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { FeedListResult } from "../types/feed-card";
import { crestsByName } from "./crest-lookup";
import { readFeedList } from "./feed-page-data";
import { playerIdFromSlug } from "./player-hub";
import { buildBoard, readPlayerSummaries, readRecordedTransfers, type BoardRow, type PlayerSummary } from "./transfer-hub";

export type BoardData = { rows: BoardRow[]; failed: boolean };
/** The board of /transfers: press transfer stories of the last 7 days and transfers recorded by the provider in the last 120. */
export async function readTransferBoard(now = new Date()): Promise<BoardData> {
  const db = getDatabase();
  if (!db) return { rows: [], failed: true };
  try {
    const database = prismaSyncDatabase(db);
    const feed = await readFeedList({ league: "all", offset: 0, sort: "latest", storyType: "TRANSFER" });
    const groups = feed.kind === "ready" ? feed.data.groups : [];
    const recorded = await readRecordedTransfers(database, now);
    const ids = [...new Set([...groups.flatMap((group) => [group.lead, ...group.others].flatMap((card) => card.entities).filter((entity) => entity.kind === "player" && entity.id).map((entity) => entity.id!)), ...recorded.map((item) => item.playerId)])];
    const players = await readPlayerSummaries(database, ids);
    const clubCrests = await crestsByName([...new Set(recorded.flatMap((item) => [item.transfer.from, item.transfer.to]).filter((name): name is string => Boolean(name)))]);
    return { rows: buildBoard({ groups, recorded, players, clubCrests }), failed: feed.kind === "error" };
  } catch { logger.error({ requestId: crypto.randomUUID() }, "transfers.board_failed"); return { rows: [], failed: true }; }
}

export type Dossier = { player: PlayerSummary; stories: FeedListResult; clubCrests: Record<string, string> };
export type DossierResult = { kind: "ready"; data: Dossier } | { kind: "not-found" } | { kind: "error" };
/** One player's transfer dossier: provider profile, current club and the press stories about transfers. */
export const readTransferDossier = cache(async (slug: string): Promise<DossierResult> => {
  const id = playerIdFromSlug(slug);
  const db = getDatabase();
  if (!id) return { kind: "not-found" };
  if (!db) return { kind: "error" };
  try {
    const summary = (await readPlayerSummaries(prismaSyncDatabase(db), [id])).get(id);
    if (!summary) return { kind: "not-found" };
    const stories = await readFeedList({ league: "all", offset: 0, sort: "latest", follow: { entityIds: [id], leagueSlugs: [] } });
    const names = [...summary.transfers.flatMap((item) => [item.from, item.to]), ...summary.rumours.map((item) => item.club), summary.providerClub].filter((name): name is string => Boolean(name));
    return { kind: "ready", data: { player: summary, stories, clubCrests: await crestsByName(names) } };
  } catch { logger.error({ requestId: crypto.randomUUID() }, "transfers.dossier_failed"); return { kind: "error" }; }
});
