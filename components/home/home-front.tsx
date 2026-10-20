import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedCardView, FeedGroupView } from "../../types/feed-card";
import type { HomeStandings } from "../../services/home-front-data";
import { feedCertaintyText, feedTransferText } from "../../lib/feed-card-presentation";
import { leagueHref, leagueLinks } from "../../lib/league-presentation";
import { newsAbsoluteTime, newsRelativeTime, storyLabels } from "../../lib/news-presentation";
import { clubPath } from "../../lib/club-presentation";
import { NewsImage } from "../ui/news-image";
import { TeamBadge } from "../ui/team-badge";
import { PlayerPhoto } from "../ui/player-photo";

export type HomeFlowTab = "danh-cho-ban" | "moi-nhat";
export const parseHomeFlowTab = (value: string | string[] | undefined): HomeFlowTab => value === "moi-nhat" ? "moi-nhat" : "danh-cho-ban";
const leagueName = (slug: string | undefined) => leagueLinks.find((link) => link.slug === slug)?.label ?? null;
const cardsOf = (group: FeedGroupView) => [group.lead, ...group.others];
const imageOf = (group: FeedGroupView) => cardsOf(group).find((card) => card.image)?.image ?? null;
const clubOf = (group: FeedGroupView) => cardsOf(group).flatMap((card) => card.entities).find((entity) => entity.kind === "club" && entity.crestUrl) ?? null;
const sourceLine = (group: FeedGroupView, now: Date) => <>{group.lead.publisher} · <time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time>{group.others.length ? ` · +${group.others.length} báo` : ""}</>;
const Arrow = () => <span aria-hidden="true">→</span>;

function SectionTitle({ id, children, aside }: { id: string; children: string; aside?: ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-3"><h2 id={id} className="flex items-center gap-2.5 text-lg font-bold tracking-tight"><span aria-hidden="true" className="h-5 w-1 rounded bg-emerald-700" />{children}</h2>{aside}</div>;
}

/**
 * "Điểm nóng hôm nay": the story most publishers are carrying, over its publisher's own picture
 * (or a plain dark panel when the feed has none). Ranking is automatic, so it is labelled as such.
 */
function Hero({ group, now }: { group: FeedGroupView; now: Date }) {
  const { lead } = group;
  const image = imageOf(group); const league = leagueName(cardsOf(group).flatMap((card) => card.leagueSlugs)[0]);
  return <section aria-labelledby="home-hot">
    <SectionTitle id="home-hot" aside={<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Nhiều báo cùng đưa tin</span>}>Điểm nóng hôm nay</SectionTitle>
    <Link href={`/news/${lead.slug}`} className="group relative flex min-h-[20rem] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white sm:min-h-[22rem]">
      {image && <NewsImage src={image} className="absolute inset-0" />}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/5" />
      {league && <span className="absolute left-4 top-4 rounded-md bg-[#c7f36b] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-950 sm:left-6 sm:top-6">{league}</span>}
      <span className="relative block p-5 sm:p-7">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">● {storyLabels[lead.storyType] ?? "Bóng đá"}</span>
        <span className="block max-w-2xl text-2xl font-bold leading-tight tracking-tight group-hover:underline sm:text-4xl">{lead.title}</span>
        {lead.description && <span className="mt-3 line-clamp-2 max-w-xl text-sm leading-6 text-white/80">{lead.description}</span>}
        <span className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/75">
          <span>{sourceLine(group, now)}{image ? <span className="ml-2 text-white/50">· Ảnh: {cardsOf(group).find((card) => card.image)!.publisher}</span> : null}</span>
          <span className="font-semibold text-white">Đọc tin <Arrow /></span>
        </span>
      </span>
    </Link>
  </section>;
}
/** "90 giây bắt nhịp bóng đá": the way into the morning brief when it is out. */
function BriefStrip({ ready }: { ready: boolean }) {
  const body = <><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg text-emerald-800">↗</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">90 giây bắt nhịp bóng đá</span>
      <span className="block text-xs text-slate-600">{ready ? "Kết quả, lịch đấu và tin đã chọn lọc trong bản tin sáng nay." : "Bản tin sáng hôm nay đang được chuẩn bị. Trong lúc chờ, xem tin mới nhất bên dưới."}</span></span>
    {ready && <span className="shrink-0 text-sm font-semibold text-emerald-900">Đọc bản tin <Arrow /></span>}</>;
  const className = "flex items-center gap-4 rounded-2xl border border-emerald-200 bg-[#eff5e9] px-4 py-3.5 sm:px-5";
  return ready ? <a href="#ban-tin-sang" className={`${className} hover:border-emerald-400`}>{body}</a> : <div className={className}>{body}</div>;
}
function FlowCard({ group, now }: { group: FeedGroupView; now: Date }) {
  const { lead } = group;
  const image = imageOf(group); const club = clubOf(group); const league = leagueName(cardsOf(group).flatMap((card) => card.leagueSlugs)[0]);
  return <li className="min-w-0">
    <Link href={`/news/${lead.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-slate-400">
      <span aria-hidden="true" className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-gradient-to-br from-emerald-50 to-slate-100">
        {club ? <TeamBadge name={club.name} tla={club.tla} crestUrl={club.crestUrl} size="lg" /> : <span className="text-2xl font-black text-slate-300">FB.</span>}
        {image && <NewsImage src={image} className="absolute inset-0" />}
      </span>
      <span className="flex flex-1 flex-col p-4">
        <span className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide"><span className="text-emerald-800">{league ?? "Bóng đá"}</span><span className="text-slate-400">{storyLabels[lead.storyType] ?? "Tin tức"}</span></span>
        <span className="line-clamp-3 break-words text-base font-bold leading-snug group-hover:underline">{lead.title}</span>
        {lead.description && <span className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{lead.description}</span>}
        <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-slate-500"><span className="min-w-0 truncate">{sourceLine(group, now)}</span><span aria-hidden="true" className="text-slate-400">→</span></span>
      </span>
    </Link>
  </li>;
}
function Flow({ groups, tab, now, personal }: { groups: FeedGroupView[]; tab: HomeFlowTab; now: Date; personal: boolean }) {
  const tabLink = (key: HomeFlowTab, label: string) => <Link href={key === "danh-cho-ban" ? "/#dong-chay" : "/?dong=moi-nhat#dong-chay"} aria-current={key === tab ? "page" : undefined}
    className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold ${key === tab ? "border-emerald-700 text-emerald-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</Link>;
  return <section id="dong-chay" aria-labelledby="home-flow" className="scroll-mt-4">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
      <h2 id="home-flow" className="pb-2 text-lg font-bold tracking-tight">Dòng chảy bóng đá</h2>
      <nav aria-label="Cách xếp tin" className="flex gap-5">{tabLink("danh-cho-ban", "Dành cho bạn")}{tabLink("moi-nhat", "Mới nhất")}</nav>
    </div>
    {tab === "danh-cho-ban" && !personal && <p className="-mt-2 mb-3 text-xs text-slate-500">Tin nhiều báo cùng đưa. <Link href="/league/premier-league?tab=doi-bong" className="font-semibold underline underline-offset-4">Theo dõi đội bóng</Link> để có dòng tin riêng.</p>}
    {groups.length ? <ul className="grid gap-4 sm:grid-cols-2">{groups.map((group) => <FlowCard key={group.key} group={group} now={now} />)}</ul> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">Chưa có tin mới trong 7 ngày gần đây.</p>}
    <Link href={tab === "moi-nhat" ? "/news?tab=moi-nhat" : "/news"} className="mt-4 block rounded-xl border border-slate-300 bg-white py-3 text-center text-sm font-semibold hover:border-slate-500">Xem thêm tin <Arrow /></Link>
  </section>;
}
/** "Nắm nhanh": the next three stories in one line each. */
/** Shown under the hot story on phones and in the sidebar on wide screens; id keeps the two copies apart. */
function QuickPoints({ groups, id = "home-quick", className = "" }: { groups: FeedGroupView[]; id?: string; className?: string }) {
  if (!groups.length) return null;
  return <section aria-labelledby={id} className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
    <div className="mb-1 flex items-center justify-between gap-2"><h2 id={id} className="flex items-center gap-2.5 font-bold"><span aria-hidden="true" className="h-5 w-1 rounded bg-emerald-700" />Nắm nhanh</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{groups.length} điểm tin</span></div>
    <p className="mb-2 text-xs text-slate-500">Ít thời gian? Bắt đầu từ đây.</p>
    <ol className="divide-y divide-slate-100">{groups.map((group, index) => <li key={group.key}>
      <Link href={`/news/${group.lead.slug}`} className="group flex gap-3 py-3">
        <span aria-hidden="true" className="w-7 shrink-0 text-xl font-light tabular-nums text-emerald-700/50">{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0"><span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">{group.lead.title}</span>{group.lead.description && <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{group.lead.description}</span>}</span>
      </Link>
    </li>)}</ol>
    <p className="mt-1 text-[11px] text-slate-400">● Nguồn rõ ràng. Tin trùng giữa các báo được gộp lại.</p>
  </section>;
}
/** Transfer talk as the press reports it: never a confirmation badge. */
function TransferWatch({ groups }: { groups: FeedGroupView[] }) {
  if (!groups.length) return null;
  const label = (card: FeedCardView) => card.transferStage ? feedTransferText[card.transferStage] : feedCertaintyText[card.certainty];
  return <section aria-labelledby="home-transfers" className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 id="home-transfers" className="mb-2 flex items-center justify-between font-bold">Chuyển nhượng <span aria-hidden="true" className="text-slate-400">⇄</span></h2>
    <ul className="divide-y divide-slate-100">{groups.map((group) => {
      const player = cardsOf(group).flatMap((card) => card.entities).find((entity) => entity.kind === "player");
      const club = clubOf(group);
      return <li key={group.key}><Link href={`/news/${group.lead.slug}`} className="group flex items-start gap-3 py-3">
        {player ? <PlayerPhoto photoUrl={player.photoUrl} size="md" round /> : club ? <TeamBadge name={club.name} tla={club.tla} crestUrl={club.crestUrl} size="md" /> : <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">⇄</span>}
        <span className="min-w-0 flex-1">{player && <span className="block text-sm font-bold">{player.name}</span>}<span className={`line-clamp-2 leading-snug group-hover:underline ${player ? "text-xs text-slate-600" : "text-sm font-semibold"}`}>{group.lead.title}</span></span>
        <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900">{label(group.lead)}</span>
      </Link></li>;
    })}</ul>
    <p className="mt-1 text-[11px] text-slate-400">Theo cách báo đưa tin, chưa phải xác nhận hoàn tất.</p>
    <Link href="/news?tab=chuyen-nhuong" className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-emerald-900">Theo dõi thị trường <Arrow /></Link>
  </section>;
}
/** "Cuộc đua trên BXH": the leaders of one league, switchable. */
function StandingsRace({ data }: { data: HomeStandings | null }) {
  if (!data) return null;
  return <section aria-labelledby="home-table" className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 id="home-table" className="mb-2 flex items-center justify-between font-bold">Cuộc đua trên BXH <span aria-hidden="true" className="text-slate-400">🏆</span></h2>
    <nav aria-label="Chọn giải" className="mb-3 flex flex-wrap gap-1.5">{leagueLinks.map((link) => <Link key={link.slug} href={link.slug === "premier-league" ? "/#bxh" : `/?bxh=${link.slug}#bxh`} aria-current={link.slug === data.league.slug ? "page" : undefined}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${link.slug === data.league.slug ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{link.label}</Link>)}</nav>
    <table id="bxh" className="w-full scroll-mt-4 text-sm">
      <caption className="sr-only">Nhóm dẫn đầu {data.league.name}{data.league.seasonName ? ` ${data.league.seasonName}` : ""}</caption>
      <thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th scope="col" className="w-6 py-1.5 text-left font-semibold">#</th><th scope="col" className="py-1.5 text-left font-semibold">Đội bóng</th><th scope="col" className="py-1.5 text-right font-semibold">Trận</th><th scope="col" className="py-1.5 pl-3 text-right font-semibold">Điểm</th></tr></thead>
      <tbody>{data.rows.map((row) => <tr key={row.clubId} className="border-t border-slate-100">
        <td className="py-2 text-slate-500">{row.position}</td>
        <td className="py-2"><Link href={clubPath(row.clubId)} className="flex min-w-0 items-center gap-2 font-semibold hover:underline"><TeamBadge name={row.name} tla={row.tla} crestUrl={row.crestUrl} /><span className="truncate">{row.shortName?.trim() || row.name}</span></Link></td>
        <td className="py-2 text-right tabular-nums text-slate-600">{row.played ?? "—"}</td>
        <td className="py-2 pl-3 text-right font-bold tabular-nums">{row.points ?? "—"}</td>
      </tr>)}</tbody>
    </table>
    <Link href={leagueHref(data.league.slug, { tab: "bang-xep-hang" })} className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-emerald-900">Xem bảng xếp hạng đầy đủ <Arrow /></Link>
  </section>;
}

export type HomeFrontData = { ranked: FeedGroupView[]; flow: FeedGroupView[]; transfers: FeedGroupView[]; standings: HomeStandings | null; tab: HomeFlowTab; personal: boolean; briefReady: boolean };
/**
 * The homepage front: hot story, the way into the morning brief and the story flow on the left;
 * quick points, transfer talk and the league race on the right. Everything comes from attributed
 * publisher cards and stored standings; nothing is illustrative.
 */
export function HomeFront({ data, now }: { data: HomeFrontData; now: Date }) {
  const hero = data.ranked.find((group) => imageOf(group)) ?? data.ranked[0];
  const quick = data.ranked.filter((group) => group !== hero).slice(0, 3);
  const shown = new Set([hero?.key, ...quick.map((group) => group.key)]);
  const flow = data.flow.filter((group) => data.tab === "moi-nhat" || !shown.has(group.key)).slice(0, 8);
  return <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
    {!data.briefReady && <h1 className="sr-only">Bóng đá hôm nay</h1>}
    <div className="min-w-0 space-y-6">
      {hero && <Hero group={hero} now={now} />}
      <QuickPoints groups={quick} id="home-quick-mobile" className="lg:hidden" />
      <BriefStrip ready={data.briefReady} />
      <Flow groups={flow} tab={data.tab} now={now} personal={data.personal} />
    </div>
    <aside aria-label="Tóm tắt nhanh" className="min-w-0 space-y-4">
      <QuickPoints groups={quick} className="hidden lg:block" />
      <TransferWatch groups={data.transfers.slice(0, 3)} />
      <StandingsRace data={data.standings} />
    </aside>
  </div>;
}
