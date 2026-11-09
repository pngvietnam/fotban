import { randomUUID } from "node:crypto";
import { coachName, commentRejection, summarizeComments, videoUrl, type CoachName, type PulseChip, type PulseQuote, type StoredComment } from "../lib/fan-comments";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { resolveEntities } from "../providers/ai/rules";
import { CommentApiError, type FanCommentApi } from "../providers/youtube/comments";
import type { EntityCandidate } from "../types/ai-provider";
import { clubCoaches } from "./club-coaches";
import { vietnameseCatalogFrom } from "./vietnamese-catalog";

const hour = 3_600_000;
/**
 * The limits that keep the YouTube quota (10,000 units a day) far away: one statistics call plus one comment call per
 * video, at most 20 calls a pass and 1,500 a day; only videos from the last 72 hours, each read again after 2 hours at
 * the earliest; stored comments deleted 30 days after they were read (YouTube API policy).
 */
export const fanCommentRules = { callsPerPass: 20, callsPerDay: 1500, videoWindowHours: 72, refreshHours: 2, closedRefreshHours: 24, keepDays: 30, pauseRefusedHours: 6, pauseQuotaHours: 12 } as const;
const job = { name: "fan-comments", key: "youtube" } as const;
type Log = { warn(fields: Record<string, unknown>, event: string): void };
type State = { day?: string; calls?: number; pausedUntil?: string | null; code?: string | null };
export type FanCommentReport = { videos: number; calls: number; read: number; kept: number; closed: number; errors: number; purged: number; stopped: null | "PAUSED" | "DAILY_BUDGET" | "FORBIDDEN" | "QUOTA" | "UPSTREAM" };

/** Deletes comments (and comment counts) read more than 30 days ago. Runs on every pass, with or without an API key. */
export async function purgeOldFanComments(db: SqlExecutor, now = new Date()) {
  const cutoff = new Date(now.getTime() - fanCommentRules.keepDays * 24 * hour);
  const removed = await db.query<{ id: string }>(`DELETE FROM "VideoComment" WHERE "fetchedAt"<$1::timestamptz RETURNING id`, [cutoff]);
  await db.query(`DELETE FROM "VideoCommentFetch" WHERE "fetchedAt"<$1::timestamptz`, [cutoff]);
  return removed.length;
}

async function readState(db: SqlExecutor): Promise<State> {
  const [row] = await db.query<{ checkpoint: State | null }>(`SELECT checkpoint FROM "JobRun" WHERE "jobName"=$1 AND "logicalKey"=$2`, [job.name, job.key]);
  return row?.checkpoint ?? {};
}
async function saveState(db: SqlExecutor, state: State, now: Date, status: "SUCCEEDED" | "FAILED" | "SKIPPED", processed: number) {
  await db.query(`INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"startedAt","finishedAt",attempts,"recordsProcessed","errorCode","errorSafe","correlationId",checkpoint,"updatedAt")
    VALUES ($1::uuid,$2,$3,$4::"JobStatus",$5::timestamptz,$5::timestamptz,1,$6,$7,$7,$1::uuid,$8::jsonb,$5::timestamptz)
    ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status=excluded.status,"startedAt"=excluded."startedAt","finishedAt"=excluded."finishedAt",attempts="JobRun".attempts+1,"recordsProcessed"=excluded."recordsProcessed","errorCode"=excluded."errorCode","errorSafe"=excluded."errorSafe",checkpoint=excluded.checkpoint,"updatedAt"=excluded."updatedAt"`,
  [randomUUID(), job.name, job.key, status, now, processed, state.code ?? null, JSON.stringify(state)]);
}

type DueVideo = { id: string; externalId: string; matchId: string };
/** Vietnamese highlight videos of the last 72 hours whose comments are due: never read first, then the match's main highlight, then the newest. */
export async function dueCommentVideos(db: SqlExecutor, now: Date, limit: number) {
  if (limit <= 0) return [];
  return db.query<DueVideo>(`SELECT v.id,v."externalId",v."matchId" FROM "Video" v LEFT JOIN "VideoSource" s ON s.id=v."videoSourceId" LEFT JOIN "VideoCommentFetch" f ON f."videoId"=v.id
    WHERE v.provider='YOUTUBE' AND v."matchId" IS NOT NULL AND v."validationStatus"='VALIDATED' AND v."externalId" ~ '^[A-Za-z0-9_-]{11}$'
      AND v."publishedAt">$1::timestamptz-make_interval(hours=>$2::int) AND v."publishedAt"<=$1::timestamptz
      AND (lower(COALESCE(s.language,'')) LIKE 'vi%' OR lower(COALESCE(v.language,'')) LIKE 'vi%')
      AND (f."videoId" IS NULL OR (f.status='OK' AND f."fetchedAt"<=$1::timestamptz-make_interval(hours=>$3::int)) OR (f.status<>'OK' AND f."fetchedAt"<=$1::timestamptz-make_interval(hours=>$4::int)))
    ORDER BY (f."videoId" IS NULL) DESC,v."selectedAsPrimary" DESC,v."publishedAt" DESC,v.id LIMIT $5::int`,
  [now, fanCommentRules.videoWindowHours, fanCommentRules.refreshHours, fanCommentRules.closedRefreshHours, limit]);
}

/** Clubs of the competitions Fotban covers and the players of the two clubs that played: what a match's comments may name. */
async function matchCatalog(db: SqlExecutor, matchId: string, catalog: EntityCandidate[], now: Date) {
  const squad = new Set((await db.query<{ id: string }>(`SELECT DISTINCT pc."playerId" AS id FROM "PlayerClub" pc JOIN "Match" m ON pc."clubId" IN (m."homeClubId",m."awayClubId") WHERE m.id=$1::uuid AND pc."startsAt"<=$2::timestamptz AND (pc."endsAt" IS NULL OR pc."endsAt">=$2::timestamptz)`, [matchId, now])).map((row) => row.id));
  return catalog.filter((entity) => entity.kind === "club" || (entity.kind === "player" && squad.has(entity.id)));
}

/**
 * Reads the comments of the due videos within the pass budget and keeps the ones fit to count and quote. A refused key
 * or a spent quota is logged once (the code only) and pauses the job for hours; comments turned off on a video are noted
 * and asked again a day later. The commenters' names are never read.
 */
export async function syncFanComments(db: SyncDatabase, api: FanCommentApi, options: { now?: Date; callsPerPass?: number; log?: Log } = {}): Promise<FanCommentReport> {
  const now = options.now ?? new Date();
  const report: FanCommentReport = { videos: 0, calls: 0, read: 0, kept: 0, closed: 0, errors: 0, purged: await purgeOldFanComments(db, now), stopped: null };
  const state = await readState(db);
  const day = now.toISOString().slice(0, 10);
  const usedToday = state.day === day ? state.calls ?? 0 : 0;
  if (state.pausedUntil && Date.parse(state.pausedUntil) > now.getTime()) return { ...report, stopped: "PAUSED" };
  const budget = Math.min(options.callsPerPass ?? fanCommentRules.callsPerPass, fanCommentRules.callsPerDay - usedToday);
  if (budget < 2) { await saveState(db, { day, calls: usedToday, pausedUntil: null, code: null }, now, "SKIPPED", 0); return { ...report, stopped: "DAILY_BUDGET" }; }
  const videos = await dueCommentVideos(db, now, budget - 1);
  if (!videos.length) return report;
  const refuse = (code: "FORBIDDEN" | "QUOTA") => {
    report.stopped = code;
    options.log?.warn({ code }, "fan_comments.api_refused");
    return new Date(now.getTime() + (code === "QUOTA" ? fanCommentRules.pauseQuotaHours : fanCommentRules.pauseRefusedHours) * hour).toISOString();
  };
  let pausedUntil: string | null = null;
  let totals = new Map<string, number | null>();
  try {
    report.calls++;
    totals = await api.statistics(videos.map((video) => video.externalId));
  } catch (error) {
    const code = error instanceof CommentApiError ? error.code : "NETWORK";
    if (code === "FORBIDDEN" || code === "QUOTA") pausedUntil = refuse(code);
    else { report.stopped = "UPSTREAM"; report.errors++; }
  }
  if (!report.stopped) {
    const catalog = await vietnameseCatalogFrom(db);
    const catalogs = new Map<string, EntityCandidate[]>();
    for (const video of videos) {
      report.calls++;
      try {
        const comments = await api.comments(video.externalId);
        if (!catalogs.has(video.matchId)) catalogs.set(video.matchId, await matchCatalog(db, video.matchId, catalog, now));
        const known = catalogs.get(video.matchId)!;
        const kept = comments.filter((comment) => !commentRejection(comment.text)).map((comment) => {
          const entities = resolveEntities(comment.text, known);
          return { id: randomUUID(), ext: comment.id, text: comment.text, likes: comment.likeCount, at: comment.publishedAt, clubs: entities.filter((entity) => entity.kind === "club").map((entity) => entity.id), players: entities.filter((entity) => entity.kind === "player").map((entity) => entity.id) };
        });
        await db.transaction(async (tx) => {
          await tx.query(`DELETE FROM "VideoComment" WHERE "videoId"=$1::uuid AND NOT ("externalId"=ANY($2::text[]))`, [video.id, kept.map((comment) => comment.ext)]);
          if (kept.length) await tx.query(`INSERT INTO "VideoComment" (id,"videoId","externalId",text,"likeCount","publishedAt","fetchedAt","clubIds","playerIds")
            SELECT x.id,$1::uuid,x.ext,x.text,x.likes,x.at,$2::timestamptz,ARRAY(SELECT jsonb_array_elements_text(x.clubs))::uuid[],ARRAY(SELECT jsonb_array_elements_text(x.players))::uuid[]
            FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,ext text,text text,likes integer,at timestamptz,clubs jsonb,players jsonb)
            ON CONFLICT ("externalId") DO UPDATE SET "videoId"=excluded."videoId",text=excluded.text,"likeCount"=excluded."likeCount","publishedAt"=excluded."publishedAt","fetchedAt"=excluded."fetchedAt","clubIds"=excluded."clubIds","playerIds"=excluded."playerIds"`,
          [video.id, now, JSON.stringify(kept)]);
          await tx.query(`INSERT INTO "VideoCommentFetch" ("videoId","fetchedAt",status,"commentCount","readCount","keptCount") VALUES ($1::uuid,$2::timestamptz,'OK',$3,$4,$5)
            ON CONFLICT ("videoId") DO UPDATE SET "fetchedAt"=excluded."fetchedAt",status='OK',"commentCount"=excluded."commentCount","readCount"=excluded."readCount","keptCount"=excluded."keptCount"`,
          [video.id, now, totals.get(video.externalId) ?? null, comments.length, kept.length]);
        });
        report.videos++; report.read += comments.length; report.kept += kept.length;
      } catch (error) {
        const code = error instanceof CommentApiError ? error.code : "STORE";
        if (code === "FORBIDDEN" || code === "QUOTA") { pausedUntil = refuse(code); break; }
        if (code === "DISABLED" || code === "NOT_FOUND") {
          // Comments turned off, or the video is gone: nothing of it is kept; asked again a day later.
          await db.transaction(async (tx) => {
            await tx.query(`DELETE FROM "VideoComment" WHERE "videoId"=$1::uuid`, [video.id]);
            await tx.query(`INSERT INTO "VideoCommentFetch" ("videoId","fetchedAt",status,"commentCount","readCount","keptCount") VALUES ($1::uuid,$2::timestamptz,$3,$4,0,0)
              ON CONFLICT ("videoId") DO UPDATE SET "fetchedAt"=excluded."fetchedAt",status=excluded.status,"commentCount"=excluded."commentCount","readCount"=0,"keptCount"=0`, [video.id, now, code, totals.get(video.externalId) ?? null]);
          });
          report.closed++;
        } else report.errors++;
      }
    }
  }
  await saveState(db, { day, calls: usedToday + report.calls, pausedUntil, code: report.stopped === "FORBIDDEN" || report.stopped === "QUOTA" ? report.stopped : null }, now, pausedUntil ? "FAILED" : "SUCCEEDED", report.kept);
  return report;
}

export type FanQuote = PulseQuote & { /** "Arsenal 2–1 Chelsea" on the club page, where quotes come from several matches. */ match: string | null };
/** What the stored comments say: totals, the most-named players, clubs, coaches and topics, and the most-liked comments. */
export type FanPulse = { total: number | null; read: number; kept: number; videos: number; videoUrl: string | null; chips: PulseChip[]; quotes: FanQuote[]; updatedAt: string };
export type PulseSide = { id: string; name: string; fullName: string; crestUrl: string | null };
export type PulseMatch = { id: string; slug: string; status: string; kickoffAt: string; homeScore: number | null; awayScore: number | null; home: PulseSide; away: PulseSide };
export type MatchFanPulse = FanPulse & { match: PulseMatch };

type MatchRow = { id: string; slug: string; status: string; kickoffAt: Date | string; homeScore: number | null; awayScore: number | null; homeId: string; homeName: string; homeFull: string; homeCrest: string | null; awayId: string; awayName: string; awayFull: string; awayCrest: string | null };
async function readMatches(tx: SqlExecutor, ids: string[]): Promise<PulseMatch[]> {
  if (!ids.length) return [];
  const rows = await tx.query<MatchRow>(`SELECT m.id,m.slug,m.status::text AS status,m."kickoffAt",m."homeScore",m."awayScore",h.id AS "homeId",COALESCE(h."shortName",h.name) AS "homeName",h.name AS "homeFull",h."externalCrestUrl" AS "homeCrest",a.id AS "awayId",COALESCE(a."shortName",a.name) AS "awayName",a.name AS "awayFull",a."externalCrestUrl" AS "awayCrest"
    FROM "Match" m JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId" WHERE m.id=ANY($1::uuid[])`, [ids]);
  return rows.map((row) => ({ id: row.id, slug: row.slug, status: row.status, kickoffAt: new Date(row.kickoffAt).toISOString(), homeScore: row.homeScore, awayScore: row.awayScore,
    home: { id: row.homeId, name: row.homeName, fullName: row.homeFull, crestUrl: row.homeCrest }, away: { id: row.awayId, name: row.awayName, fullName: row.awayFull, crestUrl: row.awayCrest } }));
}
const matchLabel = (match: PulseMatch) => `${match.home.name} ${match.homeScore ?? "–"}–${match.awayScore ?? "–"} ${match.away.name}`;
/** The current head coach of each club, from the stored coach lists. */
const coachesOf = (clubNames: string[]): CoachName[] => [...new Set(clubNames.flatMap((name) => clubCoaches(name)?.coaches.filter((coach) => coach.current).map((coach) => coach.name) ?? []))].map(coachName);

/** The pulse of some matches' videos: null when no comment fit to show is stored. */
async function pulseOf(tx: SqlExecutor, matches: PulseMatch[], now: Date, exclude: Set<string>, labelled: boolean): Promise<FanPulse | null> {
  if (!matches.length) return null;
  const cutoff = new Date(now.getTime() - fanCommentRules.keepDays * 24 * hour);
  const ids = matches.map((match) => match.id);
  const comments = await tx.query<Omit<StoredComment, "publishedAt"> & { publishedAt: Date | string }>(`SELECT c."externalId" AS id,c.text,c."likeCount",c."publishedAt",v."externalId" AS "videoId",v."matchId",c."clubIds",c."playerIds"
    FROM "VideoComment" c JOIN "Video" v ON v.id=c."videoId" WHERE v."matchId"=ANY($1::uuid[]) AND v."validationStatus"='VALIDATED' AND c."fetchedAt">$2::timestamptz`, [ids, cutoff]);
  if (!comments.length) return null;
  const fetches = await tx.query<{ videoId: string; commentCount: number | null; readCount: number; keptCount: number; fetchedAt: Date | string }>(`SELECT v."externalId" AS "videoId",f."commentCount",f."readCount",f."keptCount",f."fetchedAt"
    FROM "VideoCommentFetch" f JOIN "Video" v ON v.id=f."videoId" WHERE v."matchId"=ANY($1::uuid[]) AND v."validationStatus"='VALIDATED' AND f.status='OK' AND f."fetchedAt">$2::timestamptz`, [ids, cutoff]);
  const entityIds = [...new Set(comments.flatMap((comment) => [...comment.clubIds, ...comment.playerIds]))];
  const named = entityIds.length ? await tx.query<{ id: string; name: string; kind: "club" | "player" }>(`SELECT id,COALESCE("shortName",name) AS name,'club' AS kind FROM "Club" WHERE id=ANY($1::uuid[]) UNION ALL SELECT id,name,'player' AS kind FROM "Player" WHERE id=ANY($1::uuid[])`, [entityIds]) : [];
  const stored: StoredComment[] = comments.map((comment) => ({ ...comment, publishedAt: new Date(comment.publishedAt).toISOString() }));
  const { chips, quotes } = summarizeComments(stored, { names: new Map(named.map((row) => [row.id, { name: row.name, kind: row.kind }])), coaches: coachesOf(matches.flatMap((match) => [match.home.fullName, match.away.fullName])), exclude });
  const byId = new Map(matches.map((match) => [match.id, match]));
  const counted = fetches.filter((row) => row.commentCount !== null);
  const main = [...fetches].sort((a, b) => (b.commentCount ?? b.keptCount) - (a.commentCount ?? a.keptCount))[0];
  return {
    total: counted.length ? counted.reduce((sum, row) => sum + Number(row.commentCount), 0) : null,
    read: fetches.reduce((sum, row) => sum + Number(row.readCount), 0), kept: stored.length, videos: fetches.length,
    videoUrl: main ? videoUrl(main.videoId) : videoUrl(stored[0].videoId),
    chips, quotes: quotes.map((quote) => ({ ...quote, match: labelled && byId.has(quote.matchId) ? matchLabel(byId.get(quote.matchId)!) : null })),
    updatedAt: new Date(Math.max(...fetches.map((row) => new Date(row.fetchedAt).getTime()), 0) || now.getTime()).toISOString(),
  };
}

/** What fans say about one match, from the comments under its videos. */
export async function fanPulseForMatch(tx: SqlExecutor, matchId: string, now: Date): Promise<MatchFanPulse | null> {
  const [match] = await readMatches(tx, [matchId]);
  if (!match) return null;
  const pulse = await pulseOf(tx, [match], now, new Set([match.home.id, match.away.id]), false);
  return pulse ? { ...pulse, match } : null;
}

/** What fans say about a club: the comments under the videos of its matches in the last 14 days. */
export async function fanPulseForClub(tx: SqlExecutor, clubId: string, now: Date): Promise<FanPulse | null> {
  const ids = await tx.query<{ id: string }>(`SELECT id FROM "Match" WHERE ("homeClubId"=$1::uuid OR "awayClubId"=$1::uuid) AND "kickoffAt">$2::timestamptz-interval '14 days' AND "kickoffAt"<=$2::timestamptz ORDER BY "kickoffAt" DESC LIMIT 10`, [clubId, now]);
  return pulseOf(tx, await readMatches(tx, ids.map((row) => row.id)), now, new Set([clubId]), true);
}

/** The homepage: the matches with the most comments read in the last 36 hours (at least five kept), most first. */
export async function hotFanPulses(tx: SqlExecutor, now: Date, limit = 3): Promise<MatchFanPulse[]> {
  const rows = await tx.query<{ matchId: string }>(`SELECT v."matchId" FROM "VideoCommentFetch" f JOIN "Video" v ON v.id=f."videoId"
    WHERE f.status='OK' AND f."fetchedAt">$1::timestamptz-interval '36 hours' AND f."fetchedAt"<=$1::timestamptz AND v."matchId" IS NOT NULL AND v."validationStatus"='VALIDATED'
    GROUP BY v."matchId" HAVING sum(f."keptCount")>=5 ORDER BY sum(f."readCount") DESC,max(v."publishedAt") DESC,v."matchId" LIMIT $2::int`, [now, limit]);
  const pulses: MatchFanPulse[] = [];
  for (const row of rows) { const pulse = await fanPulseForMatch(tx, row.matchId, now); if (pulse) pulses.push(pulse); }
  return pulses;
}
