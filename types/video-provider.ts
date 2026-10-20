import { z } from "zod";

export const videoTypes = ["HIGHLIGHT", "EXTENDED_HIGHLIGHT", "GOALS", "INTERVIEW", "PRESS_CONFERENCE", "ANALYSIS", "REACTION", "WATCH_ALONG", "OTHER"] as const;
export const availability = ["AVAILABLE", "UNAVAILABLE", "PRIVATE", "REMOVED", "UNKNOWN"] as const;
export const videoCandidateSchema = z.object({
  externalId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/),
  channelName: z.string().min(1).max(200), title: z.string().min(1).max(500), description: z.string().max(6000).nullable(),
  publishedAt: z.iso.datetime(), durationSeconds: z.number().int().nonnegative().nullable(), language: z.string().max(30).nullable(),
  availability: z.enum(availability), vietnamAvailability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]), embedAllowed: z.boolean().nullable(),
}).strict();
export type VideoCandidate = z.infer<typeof videoCandidateSchema>;
/** players: full names (two words or more) from the match's stored lineups, used only for related clips. */
export type VideoMatch = { id: string; leagueId: string; leagueSlug: string; season: string; kickoffAt: string; status: string; home: string[]; away: string[]; players?: string[] };
export type VideoSource = { id: string; platform: string; channelId: string | null; channelHandle: string; name: string; country: string; language: string; verified: boolean; enabled: boolean; priority: number; sourceType: string; lastVerifiedAt: string | null; reviewReference: string };
export type VideoMapping = { id: string; videoSourceId: string; competitionId: string; season: string; market: string; language: string; rightsType: string; priority: number; validFrom: string; validTo: string; enabled: boolean; evidenceUrl: string };
export interface VideoProvider {
  readonly name: string;
  readonly configured: boolean;
  resolveChannel(handle: string): Promise<{ channelId: string; handle: string } | null>;
  searchMatchHighlights(match: VideoMatch, source: VideoSource): Promise<string[]>;
  getVideos(ids: string[]): Promise<{ videos: VideoCandidate[]; missingIds: string[] }>;
}
/** videoId/embedAllowed/thumbnailUrl let the page play it in YouTube's own embedded player when the owner allows it. */
export type VerifiedHighlight = { url: string; videoId?: string; embedAllowed?: boolean | null; thumbnailUrl?: string; title: string; channelName: string; videoType: typeof videoTypes[number]; publishedAt: string; checkedAt: string; language: string | null; vietnamAvailability: string };
export class VideoProviderError extends Error {
  constructor(readonly code: "NOT_CONFIGURED" | "QUOTA" | "UNAUTHORIZED" | "TIMEOUT" | "NETWORK" | "UPSTREAM" | "MALFORMED") { super(code); this.name = "VideoProviderError"; }
}
