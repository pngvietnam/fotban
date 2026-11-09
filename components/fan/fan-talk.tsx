import Link from "next/link";
import type { FanPulse, FanQuote, MatchFanPulse, PulseMatch } from "../../services/fan-pulse";
import type { PulseChip } from "../../lib/fan-comments";
import { safeCrestUrl } from "../../lib/crest";
import { matchTabHref } from "../../lib/match-tabs";

const count = (value: number) => value.toLocaleString("vi-VN");
const external = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;
const NewTab = () => <span className="sr-only"> (mở thẻ mới)</span>;
// eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
const Crest = ({ url }: { url: string | null }) => { const safe = safeCrestUrl(url); return safe ? <img src={safe} alt="" width={24} height={24} loading="lazy" referrerPolicy="no-referrer" /> : null; };
const score = (match: PulseMatch) => match.homeScore !== null && match.awayScore !== null ? `${match.homeScore} – ${match.awayScore}` : "vs";

/** "8.214 bình luận trên YouTube · đọc 100 bình luận nổi bật": the public total and how many Fotban read. */
function Counts({ pulse }: { pulse: FanPulse }) {
  return <p className="fan-count">{pulse.total !== null ? <><b>{count(pulse.total)}</b> bình luận trên YouTube · </> : null}đọc {count(pulse.read)} bình luận nổi bật{pulse.videos > 1 ? ` của ${pulse.videos} video` : ""}</p>;
}

/** What the comments name most, each with how many comments name it. */
function Chips({ chips }: { chips: PulseChip[] }) {
  if (!chips.length) return null;
  return <div className="fan-chips"><span className="fan-chips-label" aria-hidden="true">Fan nhắc nhiều</span>
    <ul aria-label="Fan nhắc nhiều">{chips.map((chip) => <li key={`${chip.kind}:${chip.key}`} className={`fan-chip ${chip.kind}`}>{chip.label} <b>{count(chip.count)}</b><span className="sr-only"> bình luận</span></li>)}</ul>
  </div>;
}

/** A comment word for word, its likes and a link to it on YouTube. Never the commenter's name. */
function Quote({ quote }: { quote: FanQuote }) {
  return <figure className="fan-quote">
    <blockquote lang="vi"><p>{quote.text}</p></blockquote>
    <figcaption>
      <span className="fan-likes"><span aria-hidden="true">♥</span> {count(quote.likeCount)}<span className="sr-only"> lượt thích</span></span>
      {quote.match && <span className="fan-quote-match">{quote.match}</span>}
      <a className="fan-quote-link" href={quote.url} {...external}>Xem bình luận<span aria-hidden="true"> ↗</span><NewTab /></a>
    </figcaption>
  </figure>;
}

function YouTubeLink({ url }: { url: string | null }) {
  return url ? <a className="fan-yt" href={url} {...external}>Xem trên YouTube<span aria-hidden="true"> ↗</span><NewTab /></a> : null;
}

const Note = () => <p className="fan-note">Ý kiến của người xem dưới video highlight trên YouTube, không phải tin đã kiểm chứng. Fotban chỉ đếm và trích nguyên văn bình luận công khai, không lưu tên người bình luận; bình luận thô tục, quảng cáo và chủ đề nặng nề được lọc bỏ.</p>;

/** One match on the homepage: the score, how much fans wrote, what they name most and their two most-liked comments. */
function PulseCard({ pulse }: { pulse: MatchFanPulse }) {
  const { match } = pulse;
  return <article className="fan-card">
    <Link className="fan-match" href={matchTabHref(match.slug, "du-kien")}>
      <span className="fan-side"><Crest url={match.home.crestUrl} /><span>{match.home.name}</span></span>
      <b className="fan-score">{score(match)}</b>
      <span className="fan-side away"><span>{match.away.name}</span><Crest url={match.away.crestUrl} /></span>
    </Link>
    <Counts pulse={pulse} />
    <Chips chips={pulse.chips} />
    {pulse.quotes.slice(0, 2).map((quote) => <Quote key={quote.id} quote={quote} />)}
    <YouTubeLink url={pulse.videoUrl} />
  </article>;
}

/** The homepage block: the matches Vietnamese viewers comment on most, summarised from their YouTube comments. */
export function FanTalkHome({ pulses }: { pulses: MatchFanPulse[] }) {
  if (!pulses.length) return null;
  return <section className="fan-section" aria-labelledby="ov-fans">
    <div className="fan-head"><h2 id="ov-fans">Fan đang nói gì</h2><span>Tổng hợp từ bình luận tiếng Việt dưới video highlight trên YouTube</span></div>
    <div className="fan-row">{pulses.slice(0, 3).map((pulse) => <PulseCard key={pulse.match.id} pulse={pulse} />)}</div>
    <Note />
  </section>;
}

/** The match and club pages: the same summary for one match, or for a club's recent matches (`wide`: across the page). */
export function FanTalkPanel({ title, pulse, wide = false }: { title: string; pulse: FanPulse | null; wide?: boolean }) {
  if (!pulse) return null;
  return <section className={`dp-panel fan-panel${wide ? " wide" : ""}`} aria-labelledby="fan-panel-title">
    <div className="dp-section-heading"><h2 id="fan-panel-title">{title}</h2></div>
    <div className="fan-panel-body">
      <div className="fan-summary"><Counts pulse={pulse} /><Chips chips={pulse.chips} /><YouTubeLink url={pulse.videoUrl} /></div>
      {pulse.quotes.length > 0 && <div className="fan-quotes">{pulse.quotes.map((quote) => <Quote key={quote.id} quote={quote} />)}</div>}
    </div>
    <Note />
  </section>;
}
