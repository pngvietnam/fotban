import Link from "next/link";
import type { FixtureRow } from "../../types/league-hub";
import type { HotNow } from "../../services/hot-now";
import type { HotReason } from "../../services/home-overview";
import { clubPath } from "../../lib/club-presentation";
import { matchWhen } from "../../lib/home-dates";
import { matchTabHref } from "../../lib/match-tabs";
import { playerPath } from "../../lib/player-presentation";
import { Mark } from "../ui/crest-mark";
import { QuickFollow, type QuickClub } from "./quick-follow";

export type MineClub = { id: string; name: string; story: { title: string; href: string } | null; next: FixtureRow | null };
export type HomeScorers = { leagueName: string; leagueHref: string; list: { name: string; goals: number; assists: number | null; team: string; crestUrl: string | null; photoUrl: string | null; href: string | null }[] };

const Flame = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.100 2-6 .5 2.500 2 4.900 4 6.500 2 1.600 3 3.500 3 5.500a7 7 0 1 1-14 0c0-1.200.4-2.300 1-3a2.500 2.500 0 0 0 2.500 2.500Z" /></svg>;

/**
 * "Đang nóng", in two groups: finished matches fans commented on under their highlight videos ("Trận"), and the clubs and
 * players named most in the last day ("Đội/Cầu thủ"), each with the headline of the most-covered story naming it as the reason.
 */
export function HotNowStrip({ hot, reasons = {} }: { hot: HotNow; reasons?: Record<string, HotReason> }) {
  if (!hot.matches.length && !hot.topics.length) return null;
  return <section className="hot-strip" aria-labelledby="ov-hot">
    <h2 id="ov-hot" className="hot-label"><Flame />Đang nóng</h2>
    {hot.matches.length > 0 && <div className="hot-group"><h3>Trận</h3><ul>
      {hot.matches.map((match) => <li key={match.slug}><Link href={matchTabHref(match.slug, "du-kien")}>
        <b>{match.home} {match.homeScore ?? "–"}–{match.awayScore ?? "–"} {match.away}</b><small>{match.comments} bình luận fan</small></Link></li>)}
    </ul></div>}
    {hot.topics.length > 0 && <div className="hot-group"><h3>Đội/Cầu thủ</h3><ul>
      {hot.topics.map((topic) => {
        const reason = reasons[`${topic.kind}-${topic.id}`];
        return <li key={`${topic.kind}-${topic.id}`}><Link href={topic.kind === "club" ? clubPath(topic.id) : playerPath(topic.id)} title={reason?.title}>
          <Mark url={topic.crestUrl} name={topic.name} size="sm" />
          <span className="hot-topic"><b>{topic.name}</b><small>{reason ? reason.title : `${topic.stories} tin${topic.comments ? ` · ${topic.comments} bình luận fan` : ""}`}</small></span>
        </Link></li>;
      })}
    </ul></div>}
  </section>;
}

/** The reader's own corner: for each followed club its next match and latest story; for a reader with none, a one-tap choice. */
export function MySpacePanel({ signedIn, mine, suggest, now }: { signedIn: boolean; mine: MineClub[]; suggest: QuickClub[]; now: Date }) {
  return <section className="fb-card followed-summary my-space" aria-labelledby="ov-mine">
    <div className="followed-summary-title"><h2 id="ov-mine" className="fb-text fb-text-title">{mine.length ? "Đội của tôi" : "Chọn đội bạn yêu"}</h2><Link className="fb-button fb-button-ghost" href={signedIn ? "/following" : "/following/manage"}>{mine.length ? "Quản lý" : "Xem tất cả"}</Link></div>
    {mine.length ? <>
      <ul className="ms-list">{mine.slice(0, 3).map((club) => <li key={club.id}>
        <Link className="ms-club" href={clubPath(club.id)}>{club.name}</Link>
        {club.next && <Link className="ms-next" href={matchTabHref(club.next.slug, "du-kien")}><small>Trận tới</small>{club.next.home.name} – {club.next.away.name}<span>{matchWhen(club.next.kickoffAt, now, false)}</span></Link>}
        {club.story && <Link className="ms-story" href={club.story.href}><small>Tin mới nhất</small>{club.story.title}</Link>}
      </li>)}</ul>
      <Link className="fb-button fb-button-primary" href="/following">Mở Bảng tin của tôi →</Link>
    </> : <>
      <p className="fb-text fb-text-meta">Chạm để theo dõi: tin, lịch đấu và kết quả của đội sẽ hiện ngay ở đây.</p>
      {suggest.length ? <QuickFollow clubs={suggest} /> : <Link className="fb-button fb-button-secondary" href="/following/manage">Chọn đội bóng →</Link>}
    </>}
  </section>;
}

/** The leaders' goals for the league shown beside the table. */
export function TopScorersPanel({ scorers }: { scorers: HomeScorers }) {
  return <section className="ov-panel ov-scorers" aria-labelledby="ov-scorers">
    <div className="ov-section-heading"><h2 id="ov-scorers">Vua phá lưới</h2><span className="ov-caption">{scorers.leagueName}</span></div>
    <ol>{scorers.list.map((scorer, index) => {
      const body = <><span>{index + 1}</span><Mark url={scorer.photoUrl} name={scorer.name} size="md" round photo /><span><b>{scorer.name}</b><small>{scorer.team}{scorer.assists !== null ? ` · ${scorer.assists} kiến tạo` : ""}</small></span><strong>{scorer.goals}</strong></>;
      return <li key={`${scorer.name}-${index}`}>{scorer.href ? <Link href={scorer.href}>{body}</Link> : <div>{body}</div>}</li>;
    })}</ol>
    <Link className="text-link" href={scorers.leagueHref}>Xem thống kê giải →</Link>
  </section>;
}
