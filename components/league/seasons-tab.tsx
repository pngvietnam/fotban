import Link from "next/link";
import type { LeagueSlug } from "../../types/league-hub";
import { leagueHref } from "../../lib/league-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { clubHistory, clubKey, sameClubName, startsAtBeginning, titleWord, type Moment, type SeasonStory } from "../../lib/league-memories";

/** Crest by club key, for the clubs Fotban knows; the others get their initials. */
export type CrestMap = Record<string, string>;
const crestFor = (crests: CrestMap, name: string) => { const key = clubKey(name); return crests[key] ?? Object.entries(crests).find(([other]) => other.length > 3 && key.length > 3 && (other.includes(key) || key.includes(other)))?.[1] ?? null; };
const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase();

/** A club's crest, or its initials on a disc: historic clubs without a stored crest are never given a made-up one. */
export function ClubMark({ name, crests, size = "md" }: { name: string; crests: CrestMap; size?: "sm" | "md" | "lg" }) {
  const url = safeCrestUrl(crestFor(crests, name));
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  return url ? <img className={`sn-crest ${size}`} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className={`sn-crest sn-initials ${size}`} aria-hidden="true">{initials(name)}</span>;
}
const Moments = ({ moments, limit }: { moments: Moment[]; limit: number }) => <ul className="sn-moments">{moments.slice(0, limit).map((moment) => <li key={moment.text} className={moment.tone}>{moment.text}</li>)}</ul>;
const scorerText = (scorers: SeasonStory["topScorers"]) => scorers?.length ? scorers.map((scorer) => `${scorer.name}${scorer.club ? ` (${scorer.club})` : ""}`).join(", ") + ` · ${scorers[0].goals} bàn` : null;

/** The latest finished season, big: champion, points against the runner-up, top scorer and what made it notable. */
function Spotlight({ story, crests, finals }: { story: SeasonStory; crests: CrestMap; finals: boolean }) {
  const margin = story.points != null && story.runnerUpPoints != null ? story.points - story.runnerUpPoints : null;
  return <section className="sn-spot" aria-labelledby="sn-spot">
    <p className="sn-kicker">Mùa giải gần nhất · {story.season}</p>
    <div className="sn-spot-main">
      <ClubMark name={story.champion} crests={crests} size="lg" />
      <div><h2 id="sn-spot">{story.champion}</h2><p>Nhà vô địch{story.points != null ? <> với <b>{story.points} điểm</b></> : null}{story.played ? ` sau ${story.played} trận` : ""}</p></div>
      {story.runnerUp && <div className="sn-spot-second"><ClubMark name={story.runnerUp} crests={crests} size="md" /><div><b>{story.runnerUp}</b><small>Á quân{story.runnerUpPoints != null ? ` · ${story.runnerUpPoints} điểm` : ""}{margin ? ` (kém ${margin})` : ""}</small></div></div>}
    </div>
    <dl className="sn-spot-facts">
      {finals && story.score && <div><dt>Chung kết</dt><dd>{story.champion} {story.score} {story.runnerUp}</dd></div>}
      {scorerText(story.topScorers) && <div><dt>Vua phá lưới</dt><dd>{scorerText(story.topScorers)}</dd></div>}
    </dl>
    <Moments moments={story.moments} limit={4} />
  </section>;
}

/** "Chọn đội của bạn": one club's whole history in this competition. */
function ClubMemories({ slug, club, stories, crests, finals }: { slug: LeagueSlug; club: string; stories: SeasonStory[]; crests: CrestMap; finals: boolean }) {
  const history = clubHistory(club, stories, finals);
  if (!history.titles.length && !history.runnerUps.length) return <section className="dp-panel lg-card"><p className="dp-muted">{club} chưa có mùa vô địch hay á quân nào trong dữ liệu.</p></section>;
  return <section className="sn-club" aria-labelledby="sn-club">
    <div className="sn-club-head"><ClubMark name={club} crests={crests} size="lg" /><div><p className="sn-kicker">Ký ức của người hâm mộ</p><h2 id="sn-club">{club}</h2><p>{titleWord(history.titles.length)} · {history.runnerUps.length} lần á quân{history.since ? ` (kể từ ${history.since})` : history.firstTitle ? ` · lần đầu ${history.firstTitle}` : ""}</p></div>
      <Link className="dp-secondary" href={leagueHref(slug, { tab: "mua-giai" })}>Bỏ chọn</Link></div>
    {history.titles.length > 0 && <>
      <h3>Những mùa lên ngôi</h3>
      <ul className="sn-years">{history.titles.map((item) => <li key={item.season}><b>{item.season}</b><span>{item.points != null ? `${item.points} điểm` : finals && item.score ? `thắng ${item.runnerUp ?? ""} ${item.score}` : "vô địch"}</span></li>)}</ul>
    </>}
    <div className="sn-club-grid">
      {history.longestStreak && <div className="sn-fact"><small>Chuỗi dài nhất</small><b>{history.longestStreak.years} năm liên tiếp</b><span>{history.longestStreak.from} → {history.longestStreak.to}</span></div>}
      {history.bestSeason?.points != null && <div className="sn-fact"><small>Mùa nhiều điểm nhất</small><b>{history.bestSeason.points} điểm</b><span>{history.bestSeason.season}</span></div>}
      {history.lastTitle && <div className="sn-fact"><small>Lần vô địch gần nhất</small><b>{history.lastTitle}</b><span>{history.titles[0]?.runnerUp ? `Á quân: ${history.titles[0].runnerUp}` : ""}</span></div>}
    </div>
    {finals && history.finalWins.some((item) => item.score) && <><h3>Các trận chung kết đã thắng</h3><ul className="sn-finals">{history.finalWins.map((item) => <li key={item.season}><b>{item.season}</b><span>{item.champion} {item.score ?? ""} {item.runnerUp}</span></li>)}</ul></>}
    {history.runnerUps.length > 0 && <><h3>{finals ? "Các trận chung kết đã thua" : "Những mùa về nhì"}</h3><ul className="sn-years sn-lost">{history.runnerUps.map((item) => <li key={item.season}><b>{item.season}</b><span>{finals && item.score ? `thua ${item.champion} ${item.score}` : `sau ${item.champion}${item.runnerUpPoints != null ? ` · ${item.runnerUpPoints} điểm` : ""}`}</span></li>)}</ul></>}
  </section>;
}

/**
 * "Mùa giải": a reader's way into the competition's memory. The latest season in the spotlight, a club picker
 * for "my team's history", the honours table with points and top scorers, and the league of clubs by titles.
 */
export function SeasonsTab({ slug, stories, tallies, crests, source, finals, club, notes = [] }: { notes?: { season: string; text: string }[]; slug: LeagueSlug; stories: SeasonStory[]; tallies: { club: string; titles: number; runnerUps: number }[]; crests: CrestMap; source: string | null; finals: boolean; club: string | null }) {
  if (!stories.length) return <section className="dp-panel"><h2>Mùa giải</h2><p className="dp-muted">Chưa có dữ liệu các mùa giải trước.</p></section>;
  const picked = club ? tallies.find((item) => sameClubName(item.club, club))?.club ?? null : null;
  const pickable = tallies.filter((item) => item.titles > 0 || item.runnerUps > 0);
  return <div className="sn">
    {picked ? <ClubMemories slug={slug} club={picked} stories={stories} crests={crests} finals={finals} /> : <Spotlight story={stories[0]} crests={crests} finals={finals} />}
    <form className="sn-picker" action={`/league/${slug}`} method="get">
      <input type="hidden" name="tab" value="mua-giai" />
      <label htmlFor="sn-club-select">Đội bạn yêu thích</label>
      <select id="sn-club-select" name="clb" defaultValue={picked ?? ""}>
        <option value="">Chọn đội để xem lịch sử…</option>
        {[...pickable].sort((a, b) => a.club.localeCompare(b.club, "vi")).map((item) => <option key={item.club} value={item.club}>{item.club} ({item.titles} · {item.runnerUps})</option>)}
      </select>
      <button type="submit" className="dp-secondary">Xem</button>
    </form>
    <div className="sn-columns">
      <section className="dp-panel lg-card" aria-labelledby="sn-roll">
        <div className="lg-card-head"><h2 id="sn-roll">Bảng vàng các mùa</h2><span>{stories.length} mùa</span></div>
        <ol className="sn-roll">{stories.slice(0, 40).map((story) => <li key={story.season}>
          <span className="sn-season">{story.season}</span>
          <div className="sn-roll-body">
            <div className="sn-roll-champ"><ClubMark name={story.champion} crests={crests} /><div><b>{story.champion}</b><small>Vô địch{story.points != null ? ` · ${story.points} điểm` : ""}</small></div></div>
            {story.runnerUp && <div className="sn-roll-second"><ClubMark name={story.runnerUp} crests={crests} size="sm" /><span>{story.runnerUp}<small>{story.runnerUpPoints != null ? `Á quân · ${story.runnerUpPoints} điểm` : "Á quân"}{finals && story.score ? ` · chung kết ${story.score}` : ""}</small></span></div>}
            {scorerText(story.topScorers) && <p className="sn-roll-scorer"><span aria-hidden="true">⚽</span> <b>Vua phá lưới:</b> {scorerText(story.topScorers)}</p>}
            <Moments moments={story.moments} limit={3} />
          </div>
        </li>)}</ol>
      </section>
      <section className="dp-panel lg-card" aria-labelledby="sn-tally">
        <div className="lg-card-head"><h2 id="sn-tally">Các đội nhiều danh hiệu nhất</h2></div>
        <ol className="sn-tally">{tallies.slice(0, 10).map((item, index) => <li key={item.club}>
          <span className="lg-rank">{index + 1}</span><ClubMark name={item.club} crests={crests} size="sm" />
          <Link href={`${leagueHref(slug, { tab: "mua-giai" })}&clb=${encodeURIComponent(item.club)}`}>{item.club}</Link>
          <span className="lg-tally-num"><b>{item.titles}</b><small>vô địch</small></span><span className="lg-tally-num"><b>{item.runnerUps}</b><small>á quân</small></span>
        </li>)}</ol>
      </section>
    </div>
    {notes.length > 0 && <ul className="sn-notes" aria-label="Ghi chú về số liệu">{notes.map((note) => <li key={note.text}><b>{note.season}</b> {note.text}</li>)}</ul>}
    <p className="dp-note">Tổng hợp từ các trang Wikipedia{source ? <> (<a href={source} target="_blank" rel="noopener noreferrer">danh sách nhà vô địch</a>)</> : null} và từng mùa giải, đối chiếu Wikidata. {stories.length && !startsAtBeginning(stories) ? `Số liệu bắt đầu từ mùa ${stories[stories.length - 1].season} (khi giải mang tên hiện nay). ` : ""}Điểm và vua phá lưới có từ mùa 1995/96. Các “điểm nhấn” được tính từ chính các số liệu này.</p>
  </div>;
}
