import type { VerifiedHighlight } from "../../types/video-provider";
import { formatMatchDate, formatMatchTime } from "../../lib/match-presentation";
import { HighlightGallery, type GalleryVideo } from "./highlight-player";

const kindText: Record<string, string> = { HIGHLIGHT: "Highlight", EXTENDED_HIGHLIGHT: "Highlight mở rộng", GOALS: "Bàn thắng", INTERVIEW: "Phỏng vấn", PRESS_CONFERENCE: "Họp báo", REACTION: "Phản ứng", ANALYSIS: "Phân tích" };
const languageText = (language: string | null) => language?.startsWith("vi") ? "Tiếng Việt" : language ? "Ngôn ngữ quốc tế" : null;
/** Display text is prepared here (server time zone and labels) so the client player only switches videos. */
function toGallery(video: VerifiedHighlight, primary: boolean): GalleryVideo | null {
  if (!video.videoId) return null;
  const kind = primary ? kindText[video.videoType] ?? "Highlight" : kindText[video.videoType] ?? "Clip";
  const meta = [video.channelName, languageText(video.language), `${formatMatchTime(video.publishedAt)} · ${formatMatchDate(video.publishedAt, true)}`].filter(Boolean).join(" · ");
  return { videoId: video.videoId, url: video.url, title: video.title, embedAllowed: video.embedAllowed, thumbnailUrl: video.thumbnailUrl, kind, meta };
}

/** The match highlight from a reviewed Vietnamese rights holder, playable on the page, with the match's other clips. */
export function MatchHighlight({ highlight, related = [] }: { highlight?: VerifiedHighlight | null; related?: VerifiedHighlight[] }) {
  const videos = [highlight ? toGallery(highlight, true) : null, ...related.map((video) => toGallery(video, false))].filter((video): video is GalleryVideo => Boolean(video));
  return <section aria-labelledby="match-highlight" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 id="match-highlight" className="flex items-center gap-2 font-bold"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-md bg-red-600 text-[10px] text-white">▶</span>Video trận đấu</h2>
    {highlight && !highlight.videoId ? <p className="mt-3 text-sm"><a href={highlight.url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-800 underline underline-offset-4">{highlight.title}<span className="sr-only"> — Xem trên YouTube, mở tab mới</span><span aria-hidden="true"> ↗</span></a><span className="mt-1 block text-xs text-slate-500">{highlight.channelName}{languageText(highlight.language) ? ` · ${languageText(highlight.language)}` : ""} · {formatMatchTime(highlight.publishedAt)} · {formatMatchDate(highlight.publishedAt, true)}</span></p>
      : videos.length ? <HighlightGallery videos={videos} />
      : <p className="mt-3 text-sm leading-7 text-slate-600">Chưa có highlight tiếng Việt từ kênh bản quyền.</p>}
  </section>;
}
