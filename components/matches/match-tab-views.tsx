import Link from "next/link";
import type { MatchDetail } from "../../types/match-ui";
import type { MatchHub } from "../../services/match-hub";
import { teamName } from "../../lib/match-presentation";
import { playerPath } from "../../lib/player-presentation";
import { StandingsTable } from "../league/league-hub";
import { NewsImage } from "../ui/news-image";
import type { MatchReview } from "../../lib/match-review";
import { newsRelativeTime } from "../../lib/news-presentation";
import { safeCrestUrl } from "../../lib/crest";

const eventLabels: Record<string, string> = { GOAL: "Bàn thắng", OWN_GOAL: "Phản lưới", PENALTY: "Phạt đền", YELLOW_CARD: "Thẻ vàng", RED_CARD: "Thẻ đỏ", SUBSTITUTION: "Thay người", OTHER: "Sự kiện" };
const panel = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

export function Unavailable({ children }: { children: string }) {
  return <p role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm leading-7 text-slate-600">{children}</p>;
}

type MatchEventView = MatchDetail["events"][number];
type Person = { id?: string; name: string } | null;
const minuteText = (event: MatchEventView) => event.minute == null ? "—" : `${event.minute}${event.addedMinute ? `+${event.addedMinute}` : ""}′`;
/** The canonical player when matched, else the provider's own (often shortened) name. */
const personName = (person: Person, fallback: string | null | undefined) => person?.name ?? fallback ?? null;
const isGoal = (type: string) => ["GOAL", "PENALTY", "OWN_GOAL"].includes(type);
function PersonLink({ person, fallback }: { person: Person; fallback?: string | null }) {
  const name = personName(person, fallback);
  if (!name) return null;
  return person?.id ? <Link href={playerPath(person.id)} className="inline-block py-[5px] hover:underline">{name}</Link> : <>{name}</>;
}
function EventIcon({ type, detail }: { type: string; detail: string | null }) {
  if (type === "YELLOW_CARD") return <span aria-hidden="true" className="inline-block h-4 w-3 rounded-sm bg-yellow-400" />;
  if (type === "RED_CARD") return <span aria-hidden="true" className="inline-block h-4 w-3 rounded-sm bg-red-600" />;
  if (type === "SUBSTITUTION") return <span aria-hidden="true" className="text-sm font-bold"><span className="text-emerald-600">↑</span><span className="text-rose-600">↓</span></span>;
  if (isGoal(type)) return <span aria-hidden="true">⚽</span>;
  return <span aria-hidden="true" className="rounded bg-slate-200 px-1 text-[9px] font-bold text-slate-700">{detail?.startsWith("VAR") ? "VAR" : "!"}</span>;
}
function EventBody({ event, align, club }: { event: MatchEventView; align: "left" | "right"; club: { name: string; crestUrl: string | null } }) {
  const related = personName(event.relatedPlayer, event.relatedPlayerName);
  const secondary = event.type === "SUBSTITUTION" ? (related ? <>Ra: <PersonLink person={event.relatedPlayer} fallback={event.relatedPlayerName} /></> : null)
    : (event.type === "GOAL" || event.type === "PENALTY") && related ? <>Kiến tạo: <PersonLink person={event.relatedPlayer} fallback={event.relatedPlayerName} />{event.type === "PENALTY" ? " · Phạt đền" : ""}</>
    : event.type === "PENALTY" ? "Phạt đền" : event.type === "OWN_GOAL" ? "Phản lưới nhà" : event.type === "OTHER" ? event.detail : null;
  const hasPlayer = Boolean(personName(event.player, event.playerName));
  const crest = safeCrestUrl(club.crestUrl);
  return <div className={`flex min-w-0 items-start gap-2 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : ""}`}>
    <span className="sr-only">{club.name}: </span>
    {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest */}
    {crest && <img src={crest} alt="" referrerPolicy="no-referrer" className="mt-0.5 h-4 w-4 shrink-0 object-contain sm:hidden" />}
    <span className="mt-0.5 shrink-0"><EventIcon type={event.type} detail={event.detail} /></span>
    <div className="min-w-0">
      <p className="break-words font-semibold">{event.type === "SUBSTITUTION" && hasPlayer ? <>Vào: <PersonLink person={event.player} fallback={event.playerName} /></> : hasPlayer ? <PersonLink person={event.player} fallback={event.playerName} /> : eventLabels[event.type] ?? "Sự kiện"}</p>
      {secondary && <p className="mt-0.5 break-words text-xs text-slate-500">{secondary}</p>}
    </div>
  </div>;
}
/** FotMob-style timeline: the home team's events on the left, the away team's on the right. */
export function EventsList({ match }: { match: MatchDetail }) {
  if (!match.events.length) return <Unavailable>Chưa có dữ liệu diễn biến (bàn thắng, thẻ phạt, thay người) cho trận này.</Unavailable>;
  const homeId = match.homeClub?.id;
  const clubOf = (home: boolean) => { const club = home ? match.homeClub : match.awayClub; return { name: teamName(club, home ? "home" : "away", true), crestUrl: club?.externalCrestUrl ?? null }; };
  const firstSecondHalf = match.events.findIndex((event) => (event.minute ?? 0) > 45);
  return <section aria-labelledby="match-events" className={panel}>
    <h2 id="match-events" className="font-bold">Diễn biến trận đấu</h2>
    <ol className="mt-4">{match.events.map((event, index) => {
      const home = Boolean(homeId && event.club?.id === homeId);
      return <li key={index}>
        {index === firstSecondHalf && index > 0 && <p className="my-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600">Hết hiệp 1</p>}
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)]">
          <div className={home ? "" : "max-sm:hidden"}>{home && <EventBody event={event} align="right" club={clubOf(true)} />}</div>
          <span className="justify-self-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-700 max-sm:order-first">{minuteText(event)}</span>
          <div className={home ? "max-sm:hidden" : ""}>{!home && <EventBody event={event} align="left" club={clubOf(false)} />}</div>
        </div>
      </li>;
    })}</ol>
  </section>;
}
/** Goal scorers under the scoreboard, per side. */
/** Goal scorers under the score; `className` restyles the strip (the match hero uses its own). */
export type HeroLine = { text: string; kind: "goal" | "red" };
/** Each side's goals, one line per scorer with every minute ("Phil Foden 34′, 65′ (pen)"), then its red cards. */
export function scorerLines(match: MatchDetail): { home: HeroLine[]; away: HeroLine[] } | null {
  const marks = match.events.filter((event) => isGoal(event.type) || event.type === "RED_CARD");
  if (!marks.some((event) => isGoal(event.type))) return null;
  const side = (home: boolean) => {
    const own = marks.filter((event) => Boolean(match.homeClub?.id && event.club?.id === match.homeClub.id) === home);
    const lines = new Map<string, { name: string; minutes: string[]; kind: HeroLine["kind"] }>();
    for (const event of own) {
      const name = personName(event.player, event.playerName) ?? (event.type === "RED_CARD" ? "Thẻ đỏ" : "Bàn thắng");
      const kind = event.type === "RED_CARD" ? "red" : "goal";
      const key = `${kind}:${event.player?.id ?? name}`;
      const line = lines.get(key) ?? { name, minutes: [], kind };
      line.minutes.push(`${minuteText(event)}${event.type === "PENALTY" ? " (pen)" : event.type === "OWN_GOAL" ? " (phản lưới)" : ""}`);
      lines.set(key, line);
    }
    return [...lines.values()].sort((a, b) => a.kind === b.kind ? 0 : a.kind === "goal" ? -1 : 1).map((line): HeroLine => ({ text: `${line.name} ${line.minutes.join(", ")}`, kind: line.kind }));
  };
  return { home: side(true), away: side(false) };
}
export function Scorers({ match, className = "grid grid-cols-2 gap-6 border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-600" }: { match: MatchDetail; className?: string }) {
  const lines = scorerLines(match);
  if (!lines) return null;
  return <div className={className}>
    <ul aria-label="Bàn thắng đội nhà" className="text-right">{lines.home.map((line, index) => <li key={index}>{line.text}</li>)}</ul><ul aria-label="Bàn thắng đội khách">{lines.away.map((line, index) => <li key={index}>{line.text}</li>)}</ul>
  </div>;
}

const percentLike = /possession|accuracy|percent/;
const statText: Record<string, string> = {
  possession: "Kiểm soát bóng", ball_possession: "Kiểm soát bóng", shots: "Số cú sút", expected_goals: "Bàn thắng kỳ vọng (xG)", expected_assists: "Kiến tạo kỳ vọng (xA)",
  total_shots: "Tổng số cú sút", shots_on_target: "Sút trúng đích", shots_off_target: "Sút ra ngoài", blocked_shots: "Sút bị chặn",
  shots_within_penalty_area: "Sút trong vòng cấm", shots_outside_penalty_area: "Sút ngoài vòng cấm", shots_accuracy: "Tỉ lệ sút trúng đích", big_chances_created: "Cơ hội lớn tạo ra",
  corners: "Phạt góc", corner_kicks: "Phạt góc", total_passes: "Tổng số đường chuyền", successful_passes: "Chuyền thành công", failed_passes: "Chuyền hỏng", key_passes: "Đường chuyền quyết định",
  long_passes: "Chuyền dài", successful_long_passes: "Chuyền dài thành công", crosses: "Tạt bóng", successful_crosses: "Tạt bóng thành công",
  passes_into_final_third: "Chuyền vào 1/3 sân đối phương", passes_opposition_half: "Chuyền ở phần sân đối phương", passes_own_half: "Chuyền ở phần sân nhà", backward_passes: "Chuyền về",
  tackles: "Tắc bóng", successful_tackles: "Tắc bóng thành công", interceptions: "Cắt bóng", clearances: "Phá bóng", goalkeeper_saves: "Cứu thua",
  aerial_duels: "Không chiến", successful_aerial_duels: "Không chiến thành công", dribbles: "Rê bóng", successful_dribbles: "Rê bóng thành công",
  duels_won: "Tranh chấp thắng", shots_hit_woodwork: "Sút trúng xà/cột dọc",
  fouls: "Phạm lỗi", offsides: "Việt vị", yellow_cards: "Thẻ vàng", red_cards: "Thẻ đỏ", free_kicks: "Đá phạt", goal_kicks: "Phát bóng lên", throw_ins: "Ném biên",
};
/**
 * The statistics cards, FotMob-style. Only figures worth reading are shown; everything else the
 * provider sends sits in a collapsed "Chỉ số khác". A metric may also appear in "Thống kê hàng đầu".
 */
const statCards: { title: string; metrics: string[] }[] = [
  { title: "Sút bóng", metrics: ["total_shots", "shots", "shots_on_target", "shots_off_target", "blocked_shots", "shots_hit_woodwork", "shots_within_penalty_area", "shots_outside_penalty_area"] },
  { title: "Chuyền bóng", metrics: ["total_passes", "successful_passes", "key_passes", "successful_long_passes", "successful_crosses", "passes_into_final_third", "expected_assists"] },
  { title: "Tranh bóng", metrics: ["duels_won", "successful_aerial_duels", "successful_dribbles"] },
  { title: "Phòng ngự", metrics: ["successful_tackles", "interceptions", "clearances", "goalkeeper_saves", "saves"] },
  { title: "Kỷ luật", metrics: ["fouls", "yellow_cards", "red_cards", "offsides"] },
  { title: "Bóng chết", metrics: ["corners", "corner_kicks", "free_kicks", "throw_ins", "goal_kicks"] },
];
/** Fewer is better, so the larger side is not highlighted. */
const lowerIsBetter = new Set(["fouls", "yellow_cards", "red_cards", "offsides"]);
/** Shown inside another row as its percentage ("Không chiến thành công 21 (60%)"), not as rows of their own. */
const denominators: Record<string, string> = {
  successful_passes: "total_passes", successful_long_passes: "long_passes", successful_crosses: "crosses", successful_dribbles: "dribbles",
  successful_aerial_duels: "aerial_duels", successful_tackles: "tackles", duels_won: "duels_total",
};
/** Only used as the base of a percentage. */
const hiddenMetrics = ["aerial_duels", "dribbles", "duels_total", "long_passes", "crosses", "tackles"];
/** Covered by "Thống kê hàng đầu", never repeated under "Chỉ số khác". */
const summaryMetrics = ["possession", "ball_possession", "expected_goals", "big_chances_created"];
/** Known metrics in Vietnamese; others keep the provider's English name. */
export const statLabel = (metric: string) => statText[metric] ?? metric.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
export function statValue(metric: string, value: number) {
  if (percentLike.test(metric)) return `${Math.round(value <= 1 ? value * 100 : value)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
type StatPair = { home: number | null; away: number | null };
/**
 * Home/away values per metric. When the provider gives no total, total shots are the shots inside
 * plus outside the box (a plain sum of its own figures, never an estimate).
 */
export function statPairs(match: MatchDetail) {
  const pairs = new Map<string, StatPair>();
  for (const stat of match.stats.filter((item) => !item.player)) {
    const side = stat.club.id && stat.club.id === match.homeClub?.id ? "home" : stat.club.id && stat.club.id === match.awayClub?.id ? "away" : null;
    if (!side) continue;
    const pair = pairs.get(stat.metric) ?? { home: null, away: null };
    pair[side] = Number(stat.value); pairs.set(stat.metric, pair);
  }
  // Team duels are the sum of the provider's per-player figures (box score), never an estimate.
  const players = (side: "home" | "away") => match.lineups?.find((lineup) => lineup.clubId === (side === "home" ? match.homeClub?.id : match.awayClub?.id))?.players ?? [];
  const total = (side: "home" | "away", key: string) => { const values = players(side).map((player) => player.stats?.[key]).filter((value): value is number => typeof value === "number"); return values.length ? values.reduce((sum, value) => sum + value, 0) : null; };
  if (total("home", "duelsWon") !== null || total("away", "duelsWon") !== null) {
    pairs.set("duels_won", { home: total("home", "duelsWon"), away: total("away", "duelsWon") });
    pairs.set("duels_total", { home: total("home", "duelsTotal"), away: total("away", "duelsTotal") });
  }
  if (match.shots?.length) {
    const woodwork = (clubId: string | undefined) => match.shots!.filter((shot) => shot.clubId === clubId && shot.outcome === "POST").length;
    pairs.set("shots_hit_woodwork", { home: woodwork(match.homeClub?.id), away: woodwork(match.awayClub?.id) });
  }
  const inside = pairs.get("shots_within_penalty_area"); const outside = pairs.get("shots_outside_penalty_area");
  if (!pairs.has("total_shots") && inside && outside) {
    const sum = (a: number | null, b: number | null) => a === null || b === null ? null : a + b;
    pairs.set("total_shots", { home: sum(inside.home, outside.home), away: sum(inside.away, outside.away) });
  }
  return pairs;
}
function StatRow({ metric, pair, of }: { metric: string; pair: StatPair; of?: StatPair }) {
  const share = (value: number | null, whole: number | null | undefined) => value !== null && whole ? ` (${Math.round((value / whole) * 100)}%)` : "";
  const shown = (value: number | null, side: "home" | "away") => value === null ? "—" : `${statValue(metric, value)}${of ? share(value, of[side]) : ""}`;
  const leader = !lowerIsBetter.has(metric) && pair.home !== null && pair.away !== null && pair.home !== pair.away ? (pair.home > pair.away ? "home" : "away") : null;
  return <li aria-label={`${statLabel(metric)}: ${shown(pair.home, "home")} - ${shown(pair.away, "away")}`} className="grid grid-cols-[minmax(4.5rem,auto)_1fr_minmax(4.5rem,auto)] items-center gap-2 py-1.5 text-sm">
    <span aria-hidden="true" className={`justify-self-start whitespace-nowrap rounded-full px-2 py-0.5 tabular-nums ${leader === "home" ? "mf-pill home" : "font-semibold text-slate-800"}`}>{shown(pair.home, "home")}</span>
    <span aria-hidden="true" className="text-center text-xs leading-snug text-slate-600">{statLabel(metric)}</span>
    <span aria-hidden="true" className={`justify-self-end whitespace-nowrap rounded-full px-2 py-0.5 tabular-nums ${leader === "away" ? "mf-pill away" : "font-semibold text-slate-800"}`}>{shown(pair.away, "away")}</span>
  </li>;
}
/** Team statistics as a grid of small cards, then the rest collapsed. */
export function StatsList({ match }: { match: MatchDetail }) {
  const pairs = statPairs(match);
  if (!pairs.size) return null;
  const row = (metric: string) => <StatRow key={metric} metric={metric} pair={pairs.get(metric)!} of={denominators[metric] ? pairs.get(denominators[metric]) : undefined} />;
  const cards = statCards.map((card) => ({ title: card.title, metrics: card.metrics.filter((metric, index, list) => pairs.has(metric) && !(metric === "shots" && list.includes("total_shots") && pairs.has("total_shots")) && !(metric === "corner_kicks" && pairs.has("corners")) && !(metric === "saves" && pairs.has("goalkeeper_saves"))) }))
    .filter((card) => card.metrics.length);
  const listed = new Set([...statCards.flatMap((card) => card.metrics), ...hiddenMetrics, ...summaryMetrics]);
  const others = [...pairs.keys()].filter((metric) => !listed.has(metric)).sort((a, b) => statLabel(a).localeCompare(statLabel(b), "vi"));
  return <section aria-labelledby="match-stats" className="space-y-4">
    <h2 id="match-stats" className="sr-only">Thống kê đội</h2>
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => <div key={card.title} className="dp-panel mf-card mf-tight">
        <h3 className="mf-subheading">{card.title}</h3>
        <ul className="divide-y divide-slate-100">{card.metrics.map(row)}</ul>
      </div>)}
    </div>
    {others.length > 0 && <details className="dp-panel mf-card mf-tight">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Chỉ số khác ({others.length})</summary>
      <ul className="mt-2 grid gap-x-8 divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0">{others.map(row)}</ul>
    </details>}
  </section>;
}

/** FotMob's "Thống kê hàng đầu": a possession bar, then the figures fans look at first. */
const topMetrics = ["expected_goals", "total_shots", "shots", "shots_on_target", "big_chances_created", "successful_passes", "corners", "corner_kicks", "fouls", "yellow_cards"];
/** href: link to the full statistics tab (left out on that tab itself). */
export function TopStats({ match, href, title = "Thông số nổi bật" }: { match: MatchDetail; href?: string; title?: string }) {
  const pairs = statPairs(match);
  const possession = pairs.get("possession") ?? pairs.get("ball_possession");
  const metrics = topMetrics.filter((metric) => pairs.has(metric)).filter((metric, index, list) => !(metric === "shots" && list.includes("total_shots")) && !(metric === "corner_kicks" && list.includes("corners")));
  if (!possession && !metrics.length) return null;
  const share = (value: number | null) => value === null ? null : value <= 1 ? value * 100 : value;
  const home = share(possession?.home ?? null); const away = share(possession?.away ?? null);
  const passes = pairs.get("total_passes");
  // "Chuyền chính xác 412 (86%)": accurate passes with their share of all passes, both from the provider.
  const passShare = (side: "home" | "away") => { const done = pairs.get("successful_passes")?.[side]; const total = passes?.[side]; return done != null && total ? ` (${Math.round((done / total) * 100)}%)` : ""; };
  return <section aria-labelledby="match-top-stats" className="dp-panel mf-card mf-top">
    <div className="mf-heading"><h2 id="match-top-stats">{title}</h2></div>
    {home !== null && away !== null && <div className="mf-possession">
      <p>Kiểm soát bóng</p>
      <div role="img" aria-label={`Kiểm soát bóng: ${Math.round(home)}% - ${Math.round(away)}%`}>
        <span className="home" style={{ width: `${Math.max(12, Math.min(88, home))}%` }}>{Math.round(home)}%</span>
        <span className="away">{Math.round(away)}%</span>
      </div>
    </div>}
    <ul className="mf-stats">{metrics.map((metric) => {
      const pair = pairs.get(metric)!;
      const shown = (side: "home" | "away") => pair[side] === null ? "—" : `${statValue(metric, pair[side]!)}${metric === "successful_passes" ? passShare(side) : ""}`;
      const leader = pair.home !== null && pair.away !== null && pair.home !== pair.away ? (pair.home > pair.away ? "home" : "away") : null;
      // Fewer fouls and cards is the better side, so those are not highlighted.
      const highlight = ["fouls", "yellow_cards"].includes(metric) ? null : leader;
      return <li key={metric} aria-label={`${statLabel(metric)}: ${shown("home")} - ${shown("away")}`}>
        <span aria-hidden="true" className={highlight === "home" ? "mf-pill home" : undefined}>{shown("home")}</span>
        <span aria-hidden="true">{statLabel(metric)}</span>
        <span aria-hidden="true" className={highlight === "away" ? "mf-pill away" : undefined}>{shown("away")}</span>
      </li>;
    })}</ul>
    {href && <Link href={href} className="mf-more">Xem tất cả thống kê →</Link>}
  </section>;
}
/** FotMob's "Match review": the leading Vietnamese publisher story about this match. */
export function MatchReviewCard({ review, now }: { review: MatchReview; now: Date }) {
  const { lead, others } = review.group;
  const pictured = [lead, ...others].find((card) => card.image);
  const publishers = [...new Set(others.map((card) => card.publisher))].filter((name) => name !== lead.publisher);
  return <section aria-labelledby="match-review" className="dp-panel mf-card mf-review">
    <h2 id="match-review" className="mf-kicker">{review.kind === "review" ? "Tường thuật trận đấu" : "Trước trận đấu"}</h2>
    <Link href={`/news/${lead.slug}`} className="group mt-3 flex flex-col gap-4 sm:flex-row">
      {pictured && <span className="shrink-0 sm:w-56"><NewsImage src={pictured.image} className="aspect-video rounded-xl" /><span className="mt-1 block text-[11px] text-slate-600">Ảnh: {pictured.publisher}</span></span>}
      <span className="min-w-0">
        <span className="block break-words text-lg font-bold leading-snug group-hover:underline">{lead.title}</span>
        {lead.description && <span className="mt-2 line-clamp-3 block break-words text-sm leading-6 text-slate-600">{lead.description}</span>}
        <span className="mt-3 block text-xs text-slate-500"><span className="font-semibold text-slate-700">{lead.publisher}</span> · <time dateTime={lead.publishedAt}>{newsRelativeTime(lead.publishedAt, now)}</time>{publishers.length ? ` · Cùng đưa tin: ${publishers.slice(0, 3).join(", ")}` : ""}</span>
      </span>
    </Link>
  </section>;
}

export function StandingsPanel({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  if (!hub.league || !hub.standings) return <Unavailable>Giải đấu này chưa có bảng xếp hạng.</Unavailable>;
  return <StandingsTable data={hub.standings} league={hub.league} highlight={[match.homeClub?.id, match.awayClub?.id].filter((id): id is string => Boolean(id))} />;
}
const meetingDay = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
/** Earlier meetings only (never this match), in every competition the data provider lists; wins counted for the page's home club. */
export function HeadToHeadPanel({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  const { meetings, homeWins, draws, awayWins, source } = hub.headToHead;
  const home = teamName(match.homeClub, "home", true); const away = teamName(match.awayClub, "away", true);
  if (!meetings.length) return <Unavailable>{source === "provider" ? `${home} và ${away} chưa gặp nhau trước trận này.` : "Chưa có dữ liệu các lần gặp nhau trước trận này."}</Unavailable>;
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  const crest = (club: MatchDetail["homeClub"]) => { const url = safeCrestUrl(club?.externalCrestUrl); return url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : null; };
  return <section aria-labelledby="match-h2h" className="dp-panel mf-card">
    <div className="mf-heading"><h2 id="match-h2h">Thành tích đối đầu</h2><span>{meetings.length} trận gần nhất</span></div>
    <div className="mf-h2h large"><span>{crest(match.homeClub)}<b>{homeWins}</b><small>{home} thắng</small></span><span><b>{draws}</b><small>Hòa</small></span><span>{crest(match.awayClub)}<b>{awayWins}</b><small>{away} thắng</small></span></div>
    <ul className="mf-meetings">{meetings.map((meeting) => {
      const [left, right] = meeting.homeIsPageHome ? [match.homeClub, match.awayClub] : [match.awayClub, match.homeClub];
      const leftName = teamName(left, meeting.homeIsPageHome ? "home" : "away", true); const rightName = teamName(right, meeting.homeIsPageHome ? "away" : "home", true);
      const body = <>
        <span className="mf-meeting-when">{meetingDay(meeting.date)}{meeting.competition ? <small>{meeting.competition}</small> : null}</span>
        <span className="mf-meeting-team home">{leftName}{crest(left)}</span>
        <b>{meeting.homeScore} – {meeting.awayScore}{meeting.penalties ? <small>Luân lưu {meeting.penalties}</small> : null}</b>
        <span className="mf-meeting-team">{crest(right)}{rightName}</span>
      </>;
      return <li key={meeting.key}>{meeting.slug ? <Link href={`/match/${encodeURIComponent(meeting.slug)}`} className="mf-meeting">{body}</Link> : <div className="mf-meeting">{body}</div>}</li>;
    })}</ul>
    <p className="mf-note">{source === "provider" ? "Các lần gặp nhau trước trận này ở mọi giải đấu, theo Highlightly." : "Các lần gặp nhau trước trận này trong dữ liệu Fotban đang lưu."}</p>
  </section>;
}
