import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedGroupView, FeedListResult } from "../../types/feed-card";
import type { FixtureRow, StandingsData } from "../../types/league-hub";
import { safeCrestUrl } from "../../lib/crest";
import { clubPath } from "../../lib/club-presentation";
import { formatMatchTime, formatUpdated, matchDayKey, matchStatusLabels } from "../../lib/match-presentation";
import { dayNumbers } from "../../lib/match-timeline";
import { StoryCard } from "../news/story-card";
import { zoneOf, type TableZone } from "../../lib/league-zones";

/** A crest from football-data only; the club's letters when there is none. */
export function Crest({ url, name }: { url: string | null | undefined; name: string }) {
  const safe = safeCrestUrl(url);
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  return safe ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="dp-crest-fallback" aria-hidden="true">{name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase() || "?"}</span>;
}

/** Entity header: mark or crest, kicker, title, subtitle and an action (follow). */
export function EntityHeader({ mark, crestUrl, crestName, kicker, kickerHref, title, subtitle, action }: { mark?: string; crestUrl?: string | null; crestName?: string; kicker: string; kickerHref?: string; title: string; subtitle?: string | null; action?: ReactNode }) {
  return <div className="dp-entity-header">
    {mark ? <div className="dp-entity-mark" aria-hidden="true">{mark}</div> : <Crest url={crestUrl} name={crestName ?? title} />}
    <div>{kickerHref ? <Link className="dp-kicker" href={kickerHref}>{kicker} ↗</Link> : <span className="dp-kicker">{kicker}</span>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {action}
  </div>;
}
export function DomainTabs({ tabs, active, label }: { tabs: { key: string; label: string; href: string }[]; active: string; label: string }) {
  return <nav className="dp-tabs" aria-label={label}>{tabs.map((tab) => <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined} className={tab.key === active ? "active" : ""}>{tab.label}</Link>)}</nav>;
}
export function Empty({ title, text, href, label }: { title: string; text: string; href?: string; label?: string }) {
  return <div className="dp-empty" role="status"><span aria-hidden="true">f.</span><h3>{title}</h3><p>{text}</p>{href && <Link className="dp-primary" href={href}>{label}</Link>}</div>;
}
export function PageHead({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return <div className="dp-pagehead"><span className="dp-kicker">{kicker}</span><h1>{title}</h1><p>{text}</p></div>;
}

/** Stories as cards with page links; nothing at all (or the given empty box) when there are none. */
export function StoryGrid({ result, now, offset = 0, href, empty, limit }: { result: FeedListResult; now: Date; offset?: number; href?: (offset: number) => string; empty?: { title: string; text: string }; limit?: number }) {
  if (result.kind === "error") return <Empty title="Chưa thể tải tin" text="Vui lòng thử lại sau ít phút." />;
  const groups: FeedGroupView[] = limit ? result.data.groups.slice(0, limit) : result.data.groups;
  if (!groups.length) return empty ? <Empty title={empty.title} text={empty.text} href="/news" label="Khám phá tin chung →" /> : null;
  const next = limit ? null : result.data.nextOffset;
  return <>
    <div className="context-story-grid">{groups.map((group) => <StoryCard key={group.key} card={group.lead} others={group.others.length} now={now} />)}</div>
    {href && (offset > 0 || next !== null) && <nav className="dp-pager" aria-label="Trang tin">
      {offset > 0 && <Link className="dp-secondary" href={href(0)}>Tin mới nhất</Link>}
      {next !== null && <Link className="dp-primary" href={href(next)}>Xem thêm tin →</Link>}
    </nav>}
  </>;
}

/** Fixture rows (date and time, clubs, score or "vs") linking to the match page. */
export function FixturePanel({ title, fixtures, action, empty = "Chưa có lịch phù hợp." }: { title: string; fixtures: FixtureRow[]; action?: { href: string; label: string }; empty?: string }) {
  return <section className="dp-panel" aria-label={title}>
    <div className="dp-section-heading"><h2>{title}</h2>{action && <Link href={action.href}>{action.label}</Link>}</div>
    {fixtures.length ? fixtures.map((fixture) => {
      const finished = fixture.status === "FINISHED" && fixture.homeScore !== null && fixture.awayScore !== null;
      const day = dayNumbers(matchDayKey(fixture.kickoffAt)).slice(0, 5);
      const label = fixture.status in matchStatusLabels ? matchStatusLabels[fixture.status as keyof typeof matchStatusLabels] : "";
      return <Link className="dp-fixture" key={fixture.slug} href={`/match/${encodeURIComponent(fixture.slug)}`} aria-label={`${fixture.home.name} gặp ${fixture.away.name}${finished ? `, ${fixture.homeScore} – ${fixture.awayScore}` : `, ${day}, ${formatMatchTime(fixture.kickoffAt)}`}${label ? `, ${label}` : ""}`}>
        <span>{day}<small>{formatMatchTime(fixture.kickoffAt)}</small></span>
        <span><Crest url={fixture.home.crestUrl} name={fixture.home.name} />{fixture.home.name}</span>
        <b>{finished ? `${fixture.homeScore} – ${fixture.awayScore}` : ["POSTPONED", "CANCELLED", "SUSPENDED"].includes(fixture.status) ? "—" : "vs"}</b>
        <span><Crest url={fixture.away.crestUrl} name={fixture.away.name} />{fixture.away.name}</span>
      </Link>;
    }) : <p className="dp-muted">{empty}</p>}
  </section>;
}

const tone = { W: "bg-win", D: "bg-draw", L: "bg-loss" } as const;
const letter = { W: "T", D: "H", L: "B" } as const;
const word = { W: "Thắng", D: "Hòa", L: "Thua" } as const;
export function FormDots({ form }: { form: ("W" | "D" | "L")[] }) {
  if (!form.length) return <span className="dp-muted">—</span>;
  return <ul className="dp-form" aria-label={`Phong độ: ${form.map((result) => word[result]).join(", ")}`}>{form.map((result, index) => <li key={index} aria-hidden="true" className={tone[result]}>{letter[result]}</li>)}</ul>;
}

/** The league table. `limit` gives the compact overview version; the full one adds W/D/L, goals and form. */
export function StandingsPanel({ data, leagueName, seasonName, limit, highlight = [], zones = [] }: { data: StandingsData; leagueName: string; seasonName?: string | null; limit?: number; highlight?: string[]; /** Positions with a fixed consequence (qualify, play-off, relegation), coloured and named. */ zones?: TableZone[] }) {
  if (!data.rows.length) return <section className="dp-panel"><h2>Bảng xếp hạng</h2><p className="dp-muted">Chưa có dữ liệu bảng xếp hạng.</p></section>;
  const rows = limit ? data.rows.slice(0, limit) : data.rows;
  const wide = !limit;
  const shownZones = zones.filter((zone) => rows.some((row) => row.position >= zone.from && row.position <= zone.to));
  return <section className="dp-panel" aria-label={`Bảng xếp hạng ${leagueName}`}>
    <div className="dp-section-heading"><h2>Bảng xếp hạng</h2><span>{seasonName ? `MÙA ${seasonName}` : leagueName}</span></div>
    <div className={`dp-standing dp-standing-head ${wide ? "wide" : ""}`}><span>#</span><span>CLB</span><span>Trận</span>{wide && <><span>T</span><span>H</span><span>B</span><span>Bàn</span></>}<span>HS</span><span>Điểm</span>{wide && <span className="dp-hide-small">Phong độ</span>}</div>
    {rows.map((row) => { const zone = zoneOf(zones, row.position); return <Link key={row.clubId} href={clubPath(row.clubId)} className={`dp-standing ${wide ? "wide" : ""} ${highlight.includes(row.clubId) ? "followed" : ""} ${zone ? `zone-${zone.tone}` : ""}`} title={zone?.label}>
      <span>{row.position}{zone && <span className="sr-only"> ({zone.label})</span>}</span><span><Crest url={row.crestUrl} name={row.name} />{row.shortName?.trim() || row.name}</span><span>{row.played ?? "–"}</span>
      {wide && <><span>{row.won ?? "–"}</span><span>{row.drawn ?? "–"}</span><span>{row.lost ?? "–"}</span><span>{row.goalsFor ?? "–"}:{row.goalsAgainst ?? "–"}</span></>}
      <span>{row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span><b>{row.points ?? "–"}</b>
      {wide && <span className="dp-hide-small"><FormDots form={row.form} /></span>}
    </Link>; })}
    {shownZones.length > 0 && <ul className="lg-zone-legend" aria-label="Chú thích vị trí">{shownZones.map((zone) => <li key={zone.label} className={`zone-${zone.tone}`}><i aria-hidden="true" />{zone.from === zone.to ? `Hạng ${zone.from}` : `Hạng ${zone.from}–${zone.to}`}: {zone.label}</li>)}</ul>}
    <p className="dp-note">{data.fetchedAt ? `Cập nhật lúc ${formatUpdated(data.fetchedAt)} · ` : ""}T: thắng · H: hòa · B: thua · Phong độ là 5 trận gần nhất từ kết quả đã lưu. Football data provided by the Football-Data.org API.</p>
  </section>;
}

/** The rows of a facts list ("Vị trí", "Quốc tịch"…); rows without a value are left out, never filled in. */
export function Facts({ items }: { items: [string, string | null | undefined][] }) {
  const shown = items.filter((item): item is [string, string] => Boolean(item[1]));
  return <dl className="dp-facts">{shown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
