"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { safeCrestUrl } from "../../lib/crest";
import type { RibbonMatch } from "../../services/home-overview";

const vn = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", ...options }).format(new Date(value));
const Chevron = ({ back = false }: { back?: boolean }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={back ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>;
function Crest({ url, name }: { url: string | null; name: string }) {
  const safe = safeCrestUrl(url);
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  return safe ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ov-crest-fallback" aria-hidden="true">{name.slice(0, 3).toUpperCase()}</span>;
}

const ribbonFilters = ["Tất cả", "Đã kết thúc", "Sắp diễn ra"] as const;
/** "Trên sân cỏ": a horizontal rail of the latest results and next fixtures. */
export function MatchRibbon({ matches, leagueLabels }: { matches: RibbonMatch[]; leagueLabels: Record<string, string> }) {
  const [filter, setFilter] = useState<typeof ribbonFilters[number]>("Tất cả");
  const rail = useRef<HTMLDivElement>(null);
  const shown = matches.filter((match) => filter === "Tất cả" || (filter === "Đã kết thúc") === (match.status === "FINISHED"));
  return <section className="pitch-ribbon" aria-label="Kết quả và lịch thi đấu">
    <div className="pitch-heading"><div><span className="pitch-title-mark" /><h2>Trên sân cỏ</h2><span className="pitch-timezone">UTC+7</span></div>
      <div className="pitch-actions"><button type="button" aria-label="Trận trước" onClick={() => rail.current?.scrollBy({ left: -230, behavior: "smooth" })}>‹</button><button type="button" aria-label="Trận tiếp theo" onClick={() => rail.current?.scrollBy({ left: 230, behavior: "smooth" })}>›</button><Link className="pitch-see-all" href="/matches">Xem tất cả <span aria-hidden="true">↗</span></Link></div></div>
    <div className="pitch-toolbar"><div>{ribbonFilters.map((label) => <button type="button" key={label} aria-pressed={filter === label} className={filter === label ? "active" : ""} onClick={() => { setFilter(label); rail.current?.scrollTo({ left: 0 }); }}>{label}</button>)}</div><span>Giờ Việt Nam · Vuốt để xem thêm</span></div>
    <div className="pitch-rail" ref={rail} tabIndex={0} aria-label="Danh sách trận đấu cuộn ngang">
      {!shown.length && <p className="ov-empty-note">Chưa có trận phù hợp trong mấy ngày quanh hôm nay.</p>}
      {shown.map((match) => {
        const finished = match.status === "FINISHED"; const live = match.status === "LIVE" || match.status === "HALFTIME";
        return <Link key={match.slug} href={`/match/${match.slug}${finished ? "?tab=su-kien" : ""}`} className={`pitch-match ${finished ? "finished" : "upcoming"}`}>
          <div className="pitch-match-meta"><span>{leagueLabels[match.leagueSlug] ?? match.leagueSlug}</span><small>{vn(match.kickoffAt, { day: "2-digit" })} TH{vn(match.kickoffAt, { month: "2-digit" })}</small></div>
          <div className="pitch-team"><Crest url={match.home.crestUrl} name={match.home.name} /><b>{match.home.name}</b>{(finished || live) && match.homeScore !== null && <strong>{match.homeScore}</strong>}</div>
          <div className="pitch-team"><Crest url={match.away.crestUrl} name={match.away.name} /><b>{match.away.name}</b>{(finished || live) && match.awayScore !== null && <strong>{match.awayScore}</strong>}</div>
          <div className="pitch-status">{finished ? <><span className="pitch-ft">FT</span><span>Đã kết thúc</span></> : live ? <><b>Live</b><span>Đang diễn ra</span></> : <><b>{vn(match.kickoffAt, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</b><span>Sắp diễn ra</span></>}<span className="pitch-detail">{finished ? "Diễn biến" : "Trước trận"} →</span></div>
        </Link>;
      })}
    </div>
  </section>;
}

function useRail(count: number) {
  const rail = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const step = () => (rail.current?.firstElementChild?.getBoundingClientRect().width ?? 280) + 16;
  return {
    rail, current,
    move: (back: boolean) => rail.current?.scrollBy({ left: (back ? -1 : 1) * step(), behavior: "smooth" }),
    goTo: (index: number) => rail.current?.scrollTo({ left: index * step(), behavior: "smooth" }),
    onScroll: () => { if (rail.current) setCurrent(Math.max(0, Math.min(count - 1, Math.round(rail.current.scrollLeft / step())))); },
  };
}
/** "FOTBAN PLAY": the video strip with its heading controls and position dots. */
export function CinemaRail({ title, count, note, children }: { title: ReactNode; count: number; note: string; children: ReactNode }) {
  const { rail, current, move, goTo, onScroll } = useRail(count);
  return <>
    <div className="cinema-heading">{title}<div className="cinema-controls"><span>VUỐT ĐỂ KHÁM PHÁ</span><button type="button" onClick={() => move(true)} aria-label="Video trước"><Chevron back /></button><button type="button" onClick={() => move(false)} aria-label="Video tiếp theo"><Chevron /></button></div></div>
    <div className="cinema-rail" ref={rail} onScroll={onScroll} tabIndex={0} aria-label="Danh sách video, có thể cuộn ngang">{children}</div>
    <div className="cinema-footer"><span>{note}</span><div className="rail-dots">{Array.from({ length: count }, (_, index) => <button type="button" key={index} aria-label={`Đến video ${index + 1}`} className={current === index ? "active" : ""} onClick={() => goTo(index)} />)}</div><span>Chọn video để xem</span></div>
  </>;
}
/** "Lướt một chút": short-story cards with heading controls and an "x / n" read-out. */
export function BiteRail({ title, count, children }: { title: ReactNode; count: number; children: ReactNode }) {
  const { rail, current, move, onScroll } = useRail(count);
  return <>
    <div className="ov-section-heading">{title}<span className="bite-hint">MỖI THẺ, MỘT CÂU CHUYỆN</span><div className="bite-controls"><button type="button" aria-label="Thẻ trước" onClick={() => move(true)}><Chevron back /></button><button type="button" aria-label="Thẻ tiếp" onClick={() => move(false)}><Chevron /></button></div></div>
    <div className="bite-rail" ref={rail} tabIndex={0} aria-label="Các thẻ tin ngắn, có thể cuộn ngang" onScroll={onScroll}>{children}</div>
    <div className="bite-foot"><span>Vuốt ngang để đọc tiếp</span><span>{current + 1} / {count}</span></div>
  </>;
}

/** League picker of "Cuộc đua trên BXH": reloads the page with ?bxh= and keeps the reader at the table. */
export function StandingsLeagueSelect({ value, options }: { value: string; options: { slug: string; label: string }[] }) {
  const router = useRouter();
  return <select value={value} aria-label="Chọn giải đấu trên bảng xếp hạng" onChange={(event) => router.push(`/?bxh=${encodeURIComponent(event.target.value)}#bxh`, { scroll: false })}>{options.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}</select>;
}

/** A publisher's feed picture as a bare <img> (the layout styles direct children); it disappears if it fails to load. */
export function OvPhoto({ src, alt = "" }: { src: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src?.startsWith("https://") || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked publisher image; not optimized, downloaded or stored by us
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
