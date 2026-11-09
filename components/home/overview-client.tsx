"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { safeCrestUrl } from "../../lib/crest";
import { matchWhen } from "../../lib/home-dates";
import { dramaLabels, updateTabs, type UpdateTab } from "../../lib/home-labels";
import type { RibbonMatch, WatchMatch } from "../../services/home-overview";
import { Countdown } from "../club/countdown";

const Chevron = ({ back = false }: { back?: boolean }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={back ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>;
function Crest({ url, name }: { url: string | null; name: string }) {
  const safe = safeCrestUrl(url);
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  return safe ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ov-crest-fallback" aria-hidden="true">{name.slice(0, 3).toUpperCase()}</span>;
}

/** "Trận đáng xem tiếp theo": the coming match between the best-placed clubs, with a live countdown. */
function WatchCard({ watch, leagueLabels, now }: { watch: WatchMatch; leagueLabels: Record<string, string>; now: number }) {
  return <Link className="pitch-match pitch-watch" href={`/match/${watch.slug}`}>
    <span className="pitch-watch-label">Trận đáng xem tiếp theo</span>
    <span className="pitch-match-meta"><span>{leagueLabels[watch.leagueSlug] ?? watch.leagueSlug}</span><small>{matchWhen(watch.kickoffAt, new Date(now), false)}</small></span>
    {[watch.home, watch.away].map((team) => <span className="pitch-team" key={team.name}><Crest url={team.crestUrl} name={team.name} /><b>{team.name}</b><small title={`Hạng ${team.position} trên bảng xếp hạng`}>#{team.position}</small></span>)}
    <Countdown to={watch.kickoffAt} now={now} />
  </Link>;
}

const ribbonFilters = ["Tất cả", "Đã kết thúc", "Sắp diễn ra"] as const;
/**
 * "Trên sân cỏ": a horizontal rail of results and fixtures, the reader's clubs first and then the matches with a story
 * (drama tags), led by the next match worth watching. Dates read the Vietnamese way ("Hôm qua", "Tối nay 02:00").
 */
export function MatchRibbon({ matches, watch, followed, leagueLabels, now }: { matches: RibbonMatch[]; watch: WatchMatch | null; followed: string[]; leagueLabels: Record<string, string>; now: number }) {
  const [filter, setFilter] = useState<typeof ribbonFilters[number]>("Tất cả");
  const rail = useRef<HTMLDivElement>(null);
  if (!matches.length && !watch) return null;
  const mine = new Set(followed);
  const shown = matches.filter((match) => filter === "Tất cả" || (filter === "Đã kết thúc") === (match.status === "FINISHED"));
  const hasBoth = matches.some((match) => match.status === "FINISHED") && matches.some((match) => match.status !== "FINISHED");
  return <section className="pitch-ribbon" aria-labelledby="ov-pitch">
    <div className="pitch-heading"><div><span className="pitch-title-mark" /><h2 id="ov-pitch">Trên sân cỏ</h2></div>
      <div className="pitch-actions"><button type="button" aria-label="Trận trước" onClick={() => rail.current?.scrollBy({ left: -230, behavior: "smooth" })}><Chevron back /></button><button type="button" aria-label="Trận tiếp theo" onClick={() => rail.current?.scrollBy({ left: 230, behavior: "smooth" })}><Chevron /></button><Link className="pitch-see-all" href="/matches">Xem tất cả <span aria-hidden="true">→</span></Link></div></div>
    {hasBoth && <div className="pitch-toolbar">{ribbonFilters.map((label) => <button type="button" key={label} aria-pressed={filter === label} className={filter === label ? "active" : ""} onClick={() => { setFilter(label); rail.current?.scrollTo({ left: 0 }); }}>{label}</button>)}</div>}
    <div className="pitch-rail" ref={rail} tabIndex={0} aria-label="Danh sách trận đấu cuộn ngang">
      {watch && filter !== "Đã kết thúc" && <WatchCard watch={watch} leagueLabels={leagueLabels} now={now} />}
      {shown.map((match) => {
        const finished = match.status === "FINISHED"; const live = match.status === "LIVE" || match.status === "HALFTIME";
        const ours = mine.has(match.home.id) || mine.has(match.away.id);
        return <Link key={match.slug} href={`/match/${match.slug}${finished ? "?tab=su-kien" : ""}`} className={`pitch-match ${finished ? "finished" : live ? "live" : "upcoming"}${ours ? " ours" : ""}`}>
          <span className="pitch-match-meta"><span>{leagueLabels[match.leagueSlug] ?? match.leagueSlug}</span><small>{live ? "Đang đá" : matchWhen(match.kickoffAt, new Date(now), finished)}</small></span>
          <span className="pitch-team"><Crest url={match.home.crestUrl} name={match.home.name} /><b>{match.home.name}</b>{(finished || live) && match.homeScore !== null && <strong>{match.homeScore}</strong>}</span>
          <span className="pitch-team"><Crest url={match.away.crestUrl} name={match.away.name} /><b>{match.away.name}</b>{(finished || live) && match.awayScore !== null && <strong>{match.awayScore}</strong>}</span>
          {(ours || match.tags.length > 0) && <span className="pitch-tags">{ours && <span className="pitch-tag pitch-tag-ours">Đội của bạn</span>}{match.tags.slice(0, 2).map((tag) => <span key={tag} className={`pitch-tag pitch-tag-${tag}`}>{dramaLabels[tag]}</span>)}</span>}
          <span className="pitch-status">{finished ? <span className="pitch-ft">KT</span> : live ? <b className="pitch-live">Trực tiếp</b> : null}<span className="pitch-detail">{finished ? "Diễn biến" : "Trước trận"} →</span></span>
        </Link>;
      })}
    </div>
  </section>;
}

export type StoryRow = {
  key: string; href: string; title: string; types: string[]; label: string; kind: string; publisher: string; papers: number;
  time: string; ago: string; publishedAt: string; image: string | null; fresh: boolean; crests: string[];
};
const streamSize = 10; const phoneSize = 5;
/** The rows a "Dòng tin" filter shows: groups with a card of the tab's story types, newest first, at most ten. */
export function streamRows(rows: StoryRow[], tab: UpdateTab) {
  const types: readonly string[] | null = updateTabs.find((item) => item.key === tab)?.types ?? null;
  return rows.filter((row) => !types || row.types.some((type) => types.includes(type))).slice(0, streamSize);
}
/**
 * "Dòng tin": the newest stories with type filters that switch in place (the groups are already on the page), ten on a
 * computer and five on a phone until "Xem thêm".
 */
export function StoryStream({ rows, initialTab }: { rows: StoryRow[]; initialTab: UpdateTab }) {
  const [tab, setTab] = useState<UpdateTab>(initialTab);
  const [more, setMore] = useState(false);
  const shown = streamRows(rows, tab);
  return <section className={`ov-stream${more ? " expanded" : ""}`} id="vua-cap-nhat" aria-labelledby="ov-updates">
    <div className="ov-section-heading"><h2 id="ov-updates"><span />Dòng tin</h2></div>
    <div className="desk-filters" role="group" aria-label="Loại tin">{updateTabs.map((item) => <button type="button" key={item.key} aria-pressed={item.key === tab} className={item.key === tab ? "active" : ""} onClick={() => { setTab(item.key); setMore(false); }}>{item.label}</button>)}</div>
    {!shown.length && <p className="ov-empty-note">Tuần này chưa có tin loại này.</p>}
    <ol className="ov-stream-list">{shown.map((row, index) => <li key={row.key} className={index >= phoneSize ? "ov-row-extra" : undefined}>
      <time className="ov-stream-time" dateTime={row.publishedAt} title={row.ago}>{row.time}</time>
      <div className="ov-stream-body">
        <span className="ov-kicker">{row.label}{row.fresh && <small>MỚI</small>}</span>
        <Link className="ov-stream-title" href={row.href}>{row.title}</Link>
        <span className="ov-meta">{/* eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest */}
          {row.crests.map((crest) => <img key={crest} src={crest} alt="" loading="lazy" referrerPolicy="no-referrer" />)}<span className="ov-row-kind">{row.kind} · </span>{row.publisher}{row.papers ? ` · +${row.papers} báo` : ""} · {row.ago}</span>
      </div>
      {row.image && <Link className="ov-stream-image" href={row.href} tabIndex={-1} aria-hidden="true"><OvPhoto src={row.image} /></Link>}
    </li>)}</ol>
    <div className="ov-stream-foot">
      {!more && shown.length > phoneSize && <button type="button" className="ov-more" onClick={() => setMore(true)}>Xem thêm {shown.length - phoneSize} tin</button>}
      <Link className="text-link" href="/news?tab=moi-nhat">Mở feed Tin tức <Chevron /></Link>
    </div>
  </section>;
}

/**
 * The right column on a computer: it scrolls with the page until its bottom is in view, then stays put, so a long story
 * stream never leaves an empty gap beside it (a column shorter than the window simply sticks at the top).
 */
export function StickyAside({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const aside = ref.current;
    if (!aside || typeof ResizeObserver === "undefined") return;
    const place = () => aside.style.setProperty("--ov-sticky-top", `${Math.min(16, window.innerHeight - aside.offsetHeight - 16)}px`);
    const observer = new ResizeObserver(place); observer.observe(aside);
    window.addEventListener("resize", place); place();
    return () => { observer.disconnect(); window.removeEventListener("resize", place); };
  }, []);
  return <aside ref={ref} className="ov-right" aria-label={label}>{children}</aside>;
}

/** "FOTBAN PLAY": the video strip with its heading controls and a progress bar for the position. */
export function CinemaRail({ title, count, children }: { title: ReactNode; count: number; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const step = () => (rail.current?.firstElementChild?.getBoundingClientRect().width ?? 280) + 16;
  const move = (back: boolean) => rail.current?.scrollBy({ left: (back ? -1 : 1) * step(), behavior: "smooth" });
  const onScroll = () => { const el = rail.current; if (el) setProgress(el.scrollWidth > el.clientWidth ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 1); };
  return <>
    <div className="cinema-heading">{title}{count > 1 && <div className="cinema-controls"><button type="button" onClick={() => move(true)} aria-label="Video trước"><Chevron back /></button><button type="button" onClick={() => move(false)} aria-label="Video tiếp theo"><Chevron /></button></div>}</div>
    <div className="cinema-rail" ref={rail} onScroll={onScroll} tabIndex={0} aria-label="Danh sách video, có thể cuộn ngang">{children}</div>
    {count > 1 && <div className="rail-progress" aria-hidden="true"><span style={{ width: `${Math.max(100 / count, progress * 100)}%` }} /></div>}
  </>;
}

/** League picker of the homepage table: reloads the page with ?bxh= and keeps the reader at the table. */
export function StandingsLeagueSelect({ value, options }: { value: string; options: { slug: string; label: string }[] }) {
  const router = useRouter();
  return <select value={value} aria-label="Chọn giải đấu trên bảng xếp hạng" onChange={(event) => router.push(`/?bxh=${encodeURIComponent(event.target.value)}#bxh`, { scroll: false })}>{options.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}</select>;
}

/** A publisher's feed picture as a bare <img> (the layout styles direct children); it disappears if it fails to load. `priority` marks the page's largest picture. */
export function OvPhoto({ src, alt = "", priority = false }: { src: string | null; alt?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src?.startsWith("https://") || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked publisher image; not optimized, downloaded or stored by us
  return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding={priority ? "sync" : "async"} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
