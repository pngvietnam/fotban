import { randomUUID } from "node:crypto";
import type { SyncDatabase } from "../lib/sync-database";
import { initialVideoSources } from "../providers/youtube/sources";
import { videoCandidateSchema, type VideoCandidate, type VideoMapping, type VideoMatch, type VideoSource } from "../types/video-provider";
import { primaryVideo, validateVideo } from "./video-policy";

export type StoredVideo = { id: string; video: VideoCandidate; source: VideoSource; mapping: VideoMapping; lastCheckedAt: string; selectedAsPrimary: boolean; validationStatus: string };
type RegistryRow = { source: VideoSource; mapping: VideoMapping };
export const videoFreshMs = 7 * 86400000;
export class VideoStore {
  constructor(readonly db: SyncDatabase) {}
  async registry() {
    let inserted = 0;
    for (const entry of initialVideoSources) {
      const sources = await this.db.query<{ id: string }>(`INSERT INTO "VideoSource" (id,"registryKey","channelHandle",name,country,language,verified,enabled,priority,"sourceType","lastVerifiedAt","reviewReference",notes,"updatedAt") VALUES ($1::uuid,$5,$2,$3,'VN','vi',true,true,10,'RIGHTS_HOLDER','2026-10-17T00:00:00Z',$4,'Reviewed publisher identity; API channel-ID resolution still required; links only.',now()) ON CONFLICT DO NOTHING RETURNING id`, [randomUUID(), entry.handle, entry.name, entry.review, entry.key]);
      inserted += sources.length;
      // Adopt an existing reviewed channel once without resetting operator metadata.
      await this.db.query('UPDATE "VideoSource" SET "registryKey"=$1 WHERE platform=\'YOUTUBE\' AND "channelHandle"=$2 AND "registryKey" IS NULL AND NOT EXISTS(SELECT 1 FROM "VideoSource" WHERE "registryKey"=$1)',[entry.key,entry.handle]);
      await this.db.query(`INSERT INTO "VideoSourceCompetition" (id,"videoSourceId","competitionId",season,market,language,"rightsType",priority,"validFrom","validTo",enabled,"evidenceUrl","updatedAt") SELECT $1::uuid,s.id,l.id,'2026/2027','VN','vi','AUTHORIZED_LINK',10,'2026-08-01T00:00:00Z','2027-07-01T00:00:00Z',true,$4,now() FROM "VideoSource" s CROSS JOIN "League" l WHERE s."registryKey"=$2 AND s.platform='YOUTUBE' AND l.slug=$3 AND NOT EXISTS(SELECT 1 FROM "VideoSourceCompetition" c WHERE c."videoSourceId"=s.id AND c."competitionId"=l.id) ON CONFLICT ("videoSourceId","competitionId",season,market,"validFrom") DO NOTHING`, [randomUUID(), entry.key, entry.league, entry.rights]);
    }
    return inserted;
  }
  async sources() { return this.db.query<VideoSource>(`SELECT id,platform,"channelId","channelHandle",name,country,language,verified,enabled,priority,"sourceType","lastVerifiedAt"::text AS "lastVerifiedAt","reviewReference" FROM "VideoSource" WHERE enabled AND verified ORDER BY priority,id LIMIT 10`); }
  async resolve(source: VideoSource, channelId: string | null) {
    if (!channelId || source.channelId && source.channelId !== channelId) { await this.db.query('UPDATE "VideoSource" SET verified=false,"updatedAt"=now() WHERE id=$1::uuid', [source.id]); return false; }
    await this.db.query('UPDATE "VideoSource" SET "channelId"=$2,"updatedAt"=now() WHERE id=$1::uuid AND ("channelId" IS NULL OR "channelId"=$2)', [source.id, channelId]); return true;
  }
  async mappings(match: VideoMatch): Promise<RegistryRow[]> {
    return this.db.query<RegistryRow>(`SELECT to_jsonb(s) AS source,to_jsonb(c) AS mapping FROM "VideoSourceCompetition" c JOIN "VideoSource" s ON s.id=c."videoSourceId" WHERE c."competitionId"=$1::uuid AND c.season=$2 AND c.enabled AND s.enabled AND s.verified ORDER BY c.priority,s.priority,s.id LIMIT 10`, [match.leagueId, match.season]);
  }
  async matches(now: Date, matchId?: string): Promise<VideoMatch[]> {
    const rows = await this.db.query<VideoMatch & { kickoffAt: Date }>(`SELECT m.id,m."leagueId",l.slug AS "leagueSlug",s.name AS season,m."kickoffAt",m.status,h.aliases || ARRAY[h.name,h."shortName"] AS home,a.aliases || ARRAY[a.name,a."shortName"] AS away FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Season" s ON s.id=m."seasonId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId" WHERE m.status='FINISHED' AND l.slug IN ('premier-league','la-liga') AND ${matchId ? 'm.id=$1::uuid' : 'm."kickoffAt">=$1::timestamptz-interval \'7 days\' AND m."kickoffAt"<$1::timestamptz'} ORDER BY m."kickoffAt" DESC,m.id LIMIT 3`, matchId ? [matchId] : [now]);
    return rows.map((row) => ({ ...row, kickoffAt: new Date(row.kickoffAt).toISOString(), home: row.home.filter(Boolean), away: row.away.filter(Boolean) }));
  }
  async stored(matchId: string): Promise<StoredVideo[]> {
    const rows = await this.db.query<{ id: string; row: Record<string, unknown>; source: VideoSource; mapping: VideoMapping }>(`SELECT v.id,to_jsonb(v) AS row,to_jsonb(s) AS source,to_jsonb(c) AS mapping FROM "Video" v JOIN "VideoSource" s ON s.id=v."videoSourceId" JOIN "VideoSourceCompetition" c ON c.id=v."sourceMappingId" WHERE v."matchId"=$1::uuid AND v.provider='YOUTUBE' ORDER BY v.id LIMIT 50`, [matchId]);
    return rows.flatMap(({ id, row, source, mapping }) => {
      const parsed = videoCandidateSchema.safeParse({ externalId: row.externalId, channelId: row.channelId, channelName: row.channelName, title: row.title, description: row.description, publishedAt: new Date(String(row.publishedAt)).toISOString(), durationSeconds: row.durationSeconds, language: row.language, availability: row.availabilityStatus, vietnamAvailability: row.vietnamAvailability, embedAllowed: row.embedAllowed });
      return parsed.success && row.lastCheckedAt ? [{ id, video: parsed.data, source, mapping, lastCheckedAt: new Date(String(row.lastCheckedAt)).toISOString(), selectedAsPrimary: row.selectedAsPrimary === true, validationStatus: String(row.validationStatus) }] : [];
    });
  }
  async persist(match: VideoMatch, source: VideoSource, mapping: VideoMapping, video: VideoCandidate, now: Date) {
    const checked = validateVideo(video, source, mapping, match, now);
    const trust = ({ RIGHTS_HOLDER: "RIGHTS_HOLDER", OFFICIAL_LEAGUE: "LEAGUE_OFFICIAL", OFFICIAL_CLUB: "CLUB_OFFICIAL" } as Record<string, string>)[source.sourceType] ?? "REVIEWED";
    await this.db.query(`INSERT INTO "Video" (id,provider,"externalId",title,"channelId","channelName",url,"publishedAt","durationSeconds",language,description,"videoType","availabilityStatus","vietnamAvailability","embedAllowed","videoSourceId","sourceMappingId","matchId","trustLevel","validationStatus","validationReason","checkedAt","lastCheckedAt","collectedAt","updatedAt") VALUES ($1::uuid,'YOUTUBE',$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10,$11,$12,$13,$14,$15::uuid,$16::uuid,$17::uuid,$18::"VideoTrustLevel",$19::"ValidationStatus",$20,$21::timestamptz,$21::timestamptz,$21::timestamptz,$21::timestamptz) ON CONFLICT (provider,"externalId") DO UPDATE SET title=excluded.title,"channelId"=excluded."channelId","channelName"=excluded."channelName",description=excluded.description,"publishedAt"=excluded."publishedAt","durationSeconds"=excluded."durationSeconds",language=excluded.language,"videoType"=excluded."videoType","availabilityStatus"=excluded."availabilityStatus","vietnamAvailability"=excluded."vietnamAvailability","embedAllowed"=excluded."embedAllowed","sourceMappingId"=excluded."sourceMappingId","trustLevel"=excluded."trustLevel","validationStatus"=excluded."validationStatus","validationReason"=excluded."validationReason","selectedAsPrimary"=false,"checkedAt"=excluded."checkedAt","lastCheckedAt"=excluded."lastCheckedAt","updatedAt"=excluded."updatedAt" WHERE "Video"."matchId"=excluded."matchId" AND "Video"."videoSourceId"=excluded."videoSourceId"`, [randomUUID(), video.externalId, video.title, video.channelId, video.channelName, `https://www.youtube.com/watch?v=${video.externalId}`, video.publishedAt, video.durationSeconds, video.language, video.description, checked.kind, video.availability, video.vietnamAvailability, video.embedAllowed, source.id, mapping.id, match.id, trust, checked.valid ? "VALIDATED" : video.availability !== "AVAILABLE" ? "UNAVAILABLE" : "REJECTED", checked.reason, now]);
  }
  async missing(ids: string[], now: Date) {
    if (ids.length) await this.db.query(`UPDATE "Video" SET "availabilityStatus"='UNAVAILABLE',"selectedAsPrimary"=false,"validationStatus"='UNAVAILABLE',"validationReason"='MISSING_PUBLIC_API_ITEM',title='',description=NULL,"channelName"='',"thumbnailUrl"=NULL,"durationSeconds"=NULL,language=NULL,"checkedAt"=$2::timestamptz,"lastCheckedAt"=$2::timestamptz,"updatedAt"=$2::timestamptz WHERE provider='YOUTUBE' AND "externalId"=ANY($1::text[]) AND "videoSourceId" IS NOT NULL`, [ids, now]);
  }
  async select(match: VideoMatch, now: Date) {
    const rows = await this.stored(match.id);
    const best = primaryVideo(rows.filter((row) => row.validationStatus === "VALIDATED" && now.getTime() - Date.parse(row.lastCheckedAt) < videoFreshMs), match, now);
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM "Match" WHERE id=$1::uuid FOR UPDATE', [match.id]);
      await tx.query('UPDATE "Video" SET "selectedAsPrimary"=false WHERE "matchId"=$1::uuid AND "selectedAsPrimary"', [match.id]);
      if (best) await tx.query('UPDATE "Video" SET "selectedAsPrimary"=true WHERE id=$1::uuid', [best.id]);
    });
    return best;
  }
  async purgeExpired(now: Date) {
    // No scheduler here: run the documented operational command at least daily.
    // M11 owns only unreferenced managed records; never delete an existing Brief.
    const removed = await this.db.query(`DELETE FROM "Video" v WHERE v.provider='YOUTUBE' AND v."videoSourceId" IS NOT NULL AND v."lastCheckedAt"<$1::timestamptz-interval '29 days' AND NOT EXISTS(SELECT 1 FROM "BriefItem" b WHERE b."videoId"=v.id) RETURNING id`, [now]);
    await this.db.query('UPDATE "VideoSource" SET "channelId"=NULL,"updatedAt"=$1::timestamptz WHERE "channelId" IS NOT NULL AND "updatedAt"<$1::timestamptz-interval \'29 days\'', [now]);
    return removed.length;
  }
}
