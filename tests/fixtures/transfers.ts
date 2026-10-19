import type { TransferSnapshot, TransferStatus, TransferView } from "../../types/transfers";
import { emptyTransferFacts } from "../../types/transfers";
import { newsStory } from "./news-ui";
import { clusterId } from "./clustering";
import { reliabilityPolicyVersion } from "../../services/reliability-engine";
export function transferView(status: TransferStatus = "INTEREST"): TransferView {
  const story = newsStory();
  story.transfer = { status, player: "Player X", currentClub: "Origin", targetClub: "Arsenal" };
  if (status === "CONFIRMED") { story.titleVi = "Arsenal đã ký hợp đồng với Player X"; story.summaryVi = "Arsenal đã ký hợp đồng với Player X từ Origin."; story.reliability = { label: "OFFICIAL", certainty: "CONFIRMED", disputed: false, evidenceStrength: "DIRECT", badge: { labelVi: "Chính thức / Đã xác nhận", certaintyVi: "Đã xác nhận", disputedVi: null } }; }
  return { slug: `giao-dich-${clusterId(500)}`, story, status, disputed: false, facts: emptyTransferFacts(), firstSeenAt: "2026-10-14T06:00:00Z", lastUpdatedAt: "2026-10-17T07:35:00Z", timeline: [{ headlineVi: story.titleVi, summaryVi: story.summaryVi, status, publishedAt: story.publishedAt, newsSlug: story.slug, sources: story.sources }] };
}
export function transferSnapshot(status: TransferStatus, publishedAt: string): TransferSnapshot {
  return { version: "transfer-v1", reliabilityPolicyVersion, articleId: clusterId(1), clusterId: clusterId(2), inputHash: "a".repeat(64), playerId: clusterId(901), currentClubId: clusterId(900), targetClubId: clusterId(902), status, headlineVi: "Tin chuyển nhượng có căn cứ", summaryVi: "Nội dung kiểm thử có nguồn.", publishedAt, disputed: false, facts: emptyTransferFacts(), evidenceIds: [clusterId(999)] };
}
