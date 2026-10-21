import type { SqlExecutor } from "../lib/sync-database";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";
import type { RecordedTransfer } from "../providers/highlightly/normalization";
import { feedCertaintyText, feedTransferText } from "../lib/feed-card-presentation";

export type BoardStatus = "recorded" | "talks" | "rumor";
export const boardStatusLabels: Record<BoardStatus, string> = { recorded: "Đã ghi nhận", talks: "Đang đàm phán", rumor: "Tin đồn" };
export type ClubRef = { name: string; crestUrl: string | null; clubId?: string | null };
export type BoardRow = {
  key: string; playerId: string; name: string; position: string | null; photoUrl: string | null;
  from: ClubRef | null; to: ClubRef | null;
  /** "recorded": the fee in the provider's transfer record; "market": the player's market value (an estimate, not a fee). */
  fee: { text: string; kind: "recorded" | "market" } | null;
  status: BoardStatus; statusLabel: string; date: string;
  /** Stories behind a press row, newest first. */
  stories: { slug: string; title: string; publisher: string; publishedAt: string }[];
};
export type PlayerSummary = {
  playerId: string; name: string; position: string | null; nationality: string | null; photoUrl: string | null; birthDate: string | null;
  club: ClubRef | null; marketValue: number | null; marketValueCurrency: string | null; marketValueAt: string | null;
  providerClub: string | null; joinedAt: string | null; contractExpiry: string | null;
  transfers: RecordedTransfer[]; rumours: { club: string; date: string | null }[]; injuries: { reason: string; from: string | null; to: string | null; missedGames: number | null }[]; fetchedAt: string | null;
};

const symbols: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
/** €69,87 triệu · €800 nghìn; null for no amount. */
export function moneyVi(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const symbol = symbols[currency ?? "EUR"] ?? "€";
  if (amount >= 1e6) return `${symbol}${(amount / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu`;
  return `${symbol}${Math.round(amount / 1e3).toLocaleString("vi-VN")} nghìn`;
}
const typeLabels: Record<string, string> = { transfer: "Chuyển nhượng", loan: "Cho mượn", "end of loan": "Hết hạn cho mượn" };
export const transferTypeLabel = (type: string) => typeLabels[type] ?? "Chuyển nhượng";

/** How the press frames a transfer story; never "confirmed" (that is only the provider's record). */
export function pressStatus(card: FeedCardView): { status: Exclude<BoardStatus, "recorded">; label: string } {
  if (card.transferStage === "NEGOTIATION") return { status: "talks", label: feedTransferText.NEGOTIATION };
  return { status: "rumor", label: card.transferStage ? feedTransferText[card.transferStage] : card.certainty === "REPORTED" ? feedCertaintyText.REPORTED : feedCertaintyText.UNCONFIRMED };
}

/** Summaries (club, photo, profile) for the given players. */
export async function readPlayerSummaries(tx: SqlExecutor, playerIds: string[]): Promise<Map<string, PlayerSummary>> {
  if (!playerIds.length) return new Map();
  const rows = await tx.query<{ id: string; name: string; position: string | null; nationality: string | null; birthDate: string | null; photoUrl: string | null; clubId: string | null; clubName: string | null; crest: string | null;
    marketValue: string | null; mvCurrency: string | null; mvAt: string | null; providerClub: string | null; joinedAt: string | null; contractExpiry: string | null; transfers: RecordedTransfer[] | null; rumours: PlayerSummary["rumours"] | null; injuries: PlayerSummary["injuries"] | null; fetchedAt: string | null }>(
    `SELECT p.id,p.name,p.position,p.nationality,to_char(p."birthDate",'YYYY-MM-DD') AS "birthDate",i."thumbUrl" AS "photoUrl",c.id AS "clubId",c.name AS "clubName",c."externalCrestUrl" AS crest,
       pp."marketValue"::text AS "marketValue",pp."marketValueCurrency" AS "mvCurrency",to_char(pp."marketValueAt",'YYYY-MM-DD') AS "mvAt",pp.club AS "providerClub",to_char(pp."joinedAt",'YYYY-MM-DD') AS "joinedAt",to_char(pp."contractExpiry",'YYYY-MM-DD') AS "contractExpiry",
       pp.transfers,pp.rumours,pp.injuries,pp."fetchedAt"::text AS "fetchedAt"
     FROM "Player" p LEFT JOIN "PlayerImage" i ON i."playerId"=p.id AND i.status='FOUND'
     LEFT JOIN LATERAL (SELECT c2.* FROM "PlayerClub" pc JOIN "Club" c2 ON c2.id=pc."clubId" WHERE pc."playerId"=p.id AND pc."endsAt" IS NULL ORDER BY pc."startsAt" DESC LIMIT 1) c ON true
     LEFT JOIN "PlayerProfile" pp ON pp."playerId"=p.id AND pp.provider='HIGHLIGHTLY' AND pp."fetchedAt" IS NOT NULL
     WHERE p.id=ANY($1::uuid[])`, [playerIds]);
  return new Map(rows.map((row) => [row.id, {
    playerId: row.id, name: row.name, position: row.position, nationality: row.nationality, birthDate: row.birthDate, photoUrl: row.photoUrl,
    club: row.clubName ? { name: row.clubName, crestUrl: row.crest, clubId: row.clubId } : null,
    marketValue: row.marketValue ? Number(row.marketValue) : null, marketValueCurrency: row.mvCurrency, marketValueAt: row.mvAt, providerClub: row.providerClub, joinedAt: row.joinedAt, contractExpiry: row.contractExpiry,
    transfers: row.transfers ?? [], rumours: row.rumours ?? [], injuries: row.injuries ?? [], fetchedAt: row.fetchedAt ? new Date(row.fetchedAt).toISOString() : null,
  }]));
}

/** Transfers recorded by the provider in the last `days` days, for every profiled player (loans included). */
export async function readRecordedTransfers(tx: SqlExecutor, now: Date, days = 120): Promise<{ playerId: string; transfer: RecordedTransfer }[]> {
  const rows = await tx.query<{ playerId: string; transfer: RecordedTransfer }>(
    `SELECT pp."playerId",t AS transfer FROM "PlayerProfile" pp CROSS JOIN LATERAL jsonb_array_elements(pp.transfers) t
     WHERE pp.provider='HIGHLIGHTLY' AND pp."fetchedAt" IS NOT NULL AND (t->>'date')::date>=($1::timestamptz-($2::int*interval '1 day'))::date AND (t->>'date')::date<=$1::timestamptz::date AND t->>'type' IN ('transfer','loan')
     ORDER BY (t->>'date') DESC LIMIT 60`, [now, days]);
  return rows;
}

const firstPlayer = (group: FeedGroupView) => [group.lead, ...group.others].flatMap((card) => card.entities).find((entity) => entity.kind === "player" && entity.id) ?? null;
const clubsOf = (group: FeedGroupView) => [...new Map([group.lead, ...group.others].flatMap((card) => card.entities).filter((entity) => entity.kind === "club").map((entity) => [entity.name, entity])).values()];
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Whether a provider club name ("Arsenal FC") and a stored club name denote the same club. */
export const sameClub = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false; const x = fold(a); const y = fold(b);
  return x === y || x.includes(y) || y.includes(x);
};

/**
 * The transfer board: stories the press carries about a player (one row per player, status as the press words it),
 * plus transfers recorded by the data provider. Fees appear only from a record; a market value is labelled as such.
 */
export function buildBoard(input: { groups: FeedGroupView[]; recorded: { playerId: string; transfer: RecordedTransfer }[]; players: Map<string, PlayerSummary>; clubCrests?: Record<string, string> }): BoardRow[] {
  const rows: BoardRow[] = [];
  const crest = (name: string | null) => (name && input.clubCrests?.[name]) || null;
  const byPlayer = new Map<string, FeedGroupView[]>();
  for (const group of input.groups) { const player = firstPlayer(group); if (player) byPlayer.set(player.id!, [...(byPlayer.get(player.id!) ?? []), group]); }
  for (const [playerId, groups] of byPlayer) {
    const summary = input.players.get(playerId); const lead = groups[0].lead;
    const entity = firstPlayer(groups[0])!;
    const current = summary?.club ?? null;
    const mentioned = clubsOf(groups[0]).filter((club) => !sameClub(club.name, current?.name)).map((club): ClubRef => ({ name: club.name, crestUrl: club.crestUrl ?? null }));
    const { status, label } = pressStatus(lead);
    const value = moneyVi(summary?.marketValue, summary?.marketValueCurrency);
    rows.push({ key: `press-${playerId}`, playerId, name: summary?.name ?? entity.name, position: summary?.position ?? null, photoUrl: summary?.photoUrl ?? entity.photoUrl ?? null,
      from: current, to: mentioned[0] ?? null, fee: value ? { text: value, kind: "market" } : null, status, statusLabel: label, date: groups[0].latestAt,
      stories: groups.flatMap((group) => [group.lead, ...group.others]).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map((card) => ({ slug: card.slug, title: card.title, publisher: card.publisher, publishedAt: card.publishedAt })) });
  }
  for (const { playerId, transfer } of input.recorded) {
    const summary = input.players.get(playerId); if (!summary) continue;
    const fee = moneyVi(transfer.fee, transfer.currency);
    rows.push({ key: `rec-${playerId}-${transfer.date}-${transfer.to}`, playerId, name: summary.name, position: summary.position, photoUrl: summary.photoUrl,
      from: transfer.from ? { name: transfer.from, crestUrl: crest(transfer.from) } : null, to: transfer.to ? { name: transfer.to, crestUrl: crest(transfer.to) } : null,
      fee: fee ? { text: fee, kind: "recorded" } : transfer.type === "loan" ? { text: "Cho mượn", kind: "recorded" } : transfer.feeText && /free|miễn/i.test(transfer.feeText) ? { text: "Miễn phí", kind: "recorded" } : null,
      status: "recorded", statusLabel: transfer.type === "loan" ? "Cho mượn" : boardStatusLabels.recorded, date: `${transfer.date}T12:00:00Z`, stories: [] });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
