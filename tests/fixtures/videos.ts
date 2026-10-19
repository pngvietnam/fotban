import type { VideoCandidate, VideoMapping, VideoMatch, VideoProvider, VideoSource } from "../../types/video-provider";

export const videoNow = new Date("2026-10-17T12:00:00Z");
export const vidId = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const videoMatch: VideoMatch = { id: vidId(1), leagueId: vidId(2), leagueSlug: "premier-league", season: "2026/2027", kickoffAt: "2026-10-16T18:00:00Z", status: "FINISHED", home: ["Arsenal", "Arsenal FC"], away: ["Chelsea", "Chelsea FC"] };
export function videoSource(overrides: Partial<VideoSource> = {}): VideoSource { return { id: vidId(3), platform: "YOUTUBE", channelId: `UC${"a".repeat(22)}`, channelHandle: "@test-verified-vn", name: "Fixture VN", country: "VN", language: "vi", verified: true, enabled: true, priority: 10, sourceType: "RIGHTS_HOLDER", lastVerifiedAt: "2026-10-17T00:00:00Z", reviewReference: "https://publisher.example.test/channel", ...overrides }; }
export function videoMapping(overrides: Partial<VideoMapping> = {}): VideoMapping { return { id: vidId(4), videoSourceId: vidId(3), competitionId: vidId(2), season: "2026/2027", market: "VN", language: "vi", rightsType: "AUTHORIZED_LINK", priority: 10, validFrom: "2026-08-01T00:00:00Z", validTo: "2027-07-01T00:00:00Z", enabled: true, evidenceUrl: "https://publisher.example.test/rights", ...overrides }; }
export function videoCandidate(overrides: Partial<VideoCandidate> = {}): VideoCandidate { return { externalId: "fixture0001", channelId: `UC${"a".repeat(22)}`, channelName: "Fixture VN", title: "HIGHLIGHTS: Arsenal - Chelsea | Premier League | 17/10/2026", description: "Premier League 2026/2027 match highlights. Synthetic fixture only.", publishedAt: "2026-10-16T21:00:00Z", durationSeconds: 600, language: "vi", availability: "AVAILABLE", vietnamAvailability: "UNKNOWN", embedAllowed: false, ...overrides }; }
export class FakeVideoProvider implements VideoProvider {
  readonly name = "YOUTUBE"; configured = true; searches = 0; metadata = 0; channels = 0;
  videos: VideoCandidate[] = [videoCandidate()]; failure: Error | null = null; missingIds: string[] = [];
  async resolveChannel(handle: string) { this.channels++; return { channelId: videoSource().channelId!, handle }; }
  async searchMatchHighlights(match: VideoMatch, source: VideoSource) { this.searches++; if (!match.id || !source.id) return []; if (this.failure) throw this.failure; return this.videos.map((video) => video.externalId); }
  async getVideos(ids: string[]) { this.metadata++; if (this.failure) throw this.failure; return { videos: this.videos.filter((video) => ids.includes(video.externalId) && !this.missingIds.includes(video.externalId)), missingIds: this.missingIds.filter((id) => ids.includes(id)) }; }
}
