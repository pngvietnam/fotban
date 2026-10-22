import type { FanThreadView } from "../../services/fan-threads";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";

const count = (value: number) => value.toLocaleString("vi-VN");
const window = (hours: number) => hours >= 24 ? "24 giờ" : `${hours} giờ`;
/** A thread is "sôi nổi" when its replies grew by a few hundred in the last day: a measured change, not a guess. */
const hot = (thread: FanThreadView) => thread.source === "VOZ" && thread.delta !== null && thread.deltaHours !== null && thread.delta / Math.max(thread.deltaHours, 1) >= 10;

/** One community thread as a link out: where it is, its title, how lively it is. Nothing of the posts themselves. */
export function FanThreadCard({ thread, now }: { thread: FanThreadView; now: Date }) {
  const voz = thread.source === "VOZ";
  return <a className={`fan-card ${voz ? "voz" : "reddit"}`} href={thread.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`${thread.title} (mở ${thread.community} ở thẻ mới)`}>
    <span className="fan-tag"><i aria-hidden="true" />{thread.community}{thread.kind === "MATCH" ? " · Trận đấu" : thread.kind === "CLUB" ? " · Phòng fan" : ""}{hot(thread) && <b>Đang sôi nổi</b>}</span>
    <strong lang={voz ? "vi" : "en"}>{thread.title}</strong>
    <span className="fan-meta">
      {voz && thread.replies !== null && <span>{count(thread.replies)} bình luận</span>}
      {voz && thread.delta !== null && thread.deltaHours !== null && thread.delta > 0 && <span className="fan-delta">+{count(thread.delta)} trong {window(thread.deltaHours)}</span>}
      {!voz && <span>Tiếng Anh</span>}
      <time dateTime={thread.lastActivityAt} title={newsAbsoluteTime(thread.lastActivityAt)}>{voz ? "hoạt động " : ""}{newsRelativeTime(thread.lastActivityAt, now)}</time>
      <span className="fan-go" aria-hidden="true">↗</span>
    </span>
  </a>;
}

const Note = () => <p className="fan-note">Ý kiến của người hâm mộ trên mạng, không phải tin đã kiểm chứng. Fotban chỉ dẫn tới tiêu đề và số liệu công khai; nội dung bình luận thuộc về cộng đồng.</p>;

/** A short list of threads in a side panel (match and club pages). */
export function FanTalkPanel({ title, threads, now, wide = false }: { title: string; threads: FanThreadView[]; now: Date; /** Cards side by side across the page instead of a narrow list. */ wide?: boolean }) {
  if (!threads.length) return null;
  return <section className={`dp-panel fan-panel${wide ? " wide" : ""}`} aria-labelledby="fan-panel-title"><div className="dp-section-heading"><h2 id="fan-panel-title">{title}</h2></div>
    <div className="fan-list">{threads.map((thread) => <FanThreadCard key={thread.id} thread={thread} now={now} />)}</div><Note /></section>;
}

/** The homepage block: Vietnamese fans on Voz beside the world's talk on r/soccer. */
export function FanTalkHome({ voz, reddit, now }: { voz: FanThreadView[]; reddit: FanThreadView[]; now: Date }) {
  if (!voz.length && !reddit.length) return null;
  return <section className="fan-section" aria-labelledby="ov-fans">
    <div className="fan-head"><h2 id="ov-fans">Fan đang nói gì</h2><span>Cộng đồng mạng, cập nhật mỗi 10 phút</span></div>
    <div className="fan-grid">
      {voz.length > 0 && <div className="fan-col"><h3>Fan Việt trên Voz</h3><div className="fan-list">{voz.map((thread) => <FanThreadCard key={thread.id} thread={thread} now={now} />)}</div></div>}
      {reddit.length > 0 && <div className="fan-col"><h3>Thế giới trên r/soccer</h3><div className="fan-list">{reddit.map((thread) => <FanThreadCard key={thread.id} thread={thread} now={now} />)}</div></div>}
    </div>
    <Note />
  </section>;
}
