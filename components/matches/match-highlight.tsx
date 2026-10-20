import type { VerifiedHighlight } from "../../types/video-provider";
import { formatMatchDate, formatMatchTime } from "../../lib/match-presentation";
import { HighlightPlayer } from "./highlight-player";

export function MatchHighlight({ highlight }: { highlight?: VerifiedHighlight | null }) {
  const kind = highlight?.videoType === "EXTENDED_HIGHLIGHT" ? "Highlight mở rộng" : highlight?.videoType === "GOALS" ? "Tổng hợp bàn thắng" : "Highlight";
  return <section aria-labelledby="match-highlight" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 id="match-highlight" className="font-bold">Highlight trên YouTube</h2>
    {highlight ? <div className={highlight.videoId ? "mt-4 grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-start" : ""}>
      {highlight.videoId && <HighlightPlayer videoId={highlight.videoId} title={highlight.title} url={highlight.url} embedAllowed={highlight.embedAllowed} thumbnailUrl={highlight.thumbnailUrl} />}
      <div className="min-w-0">
      <p className="mt-3 text-xs font-semibold text-slate-600 md:mt-0">{kind} · {highlight.channelName}{highlight.language?.startsWith("vi") ? " · Tiếng Việt" : highlight.language ? " · Ngôn ngữ quốc tế" : " · Chưa xác định ngôn ngữ video"}</p>
      <a href={highlight.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block max-w-full break-words text-base font-bold leading-7 text-blue-800 underline decoration-blue-200 underline-offset-4 hover:text-blue-950">{highlight.title}<span className="sr-only"> — Xem trên YouTube, mở tab mới</span><span aria-hidden="true"> ↗</span></a>
      <p className="mt-3 text-xs leading-6 text-slate-500">Đăng {formatMatchTime(highlight.publishedAt)} · {formatMatchDate(highlight.publishedAt, true)} (giờ Việt Nam).</p>
      <p className="mt-2 text-xs leading-6 text-slate-500">Nguồn và loại video do Football Morning Brief đối chiếu; đây không phải chứng nhận của YouTube. {highlight.vietnamAvailability === "UNKNOWN" ? "Chưa xác định khả năng phát tại Việt Nam." : "Thông tin giới hạn vùng theo API tại lần kiểm tra gần nhất; khả năng phát có thể thay đổi."} {highlight.embedAllowed === false ? "Chủ kênh không cho phát ngoài YouTube, hãy xem trên YouTube." : "Video phát bằng trình phát của YouTube; nếu không phát được do giới hạn nhúng hoặc khu vực, hãy mở trên YouTube."} Ứng dụng không lưu video.</p>
      </div>
    </div> : <p className="mt-3 text-sm leading-7 text-slate-600">Chưa tìm thấy highlight tiếng Việt từ nguồn được xác minh.</p>}
  </section>;
}
