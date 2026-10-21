import type { Metadata } from "next";
import Link from "next/link";
import { getDatabase } from "@/lib/db";
import { prismaSyncDatabase } from "@/lib/sync-database";
import { leagueHref } from "@/lib/league-presentation";
import { timelineLeagues } from "@/lib/match-timeline";
import { leagueInfo } from "@/services/league-hub";
import { NewsShell } from "@/components/news/news-shell";
import { PageHead } from "@/components/domain/domain-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Giải đấu | Fotban", description: "Ngoại hạng Anh, La Liga, Ligue 1 và Champions League: tin tức, lịch thi đấu, bảng xếp hạng và đội bóng." };
const shortSeason = (name: string | null) => name?.replace(/^(\d{4})\/(\d{4})$/, (_, a, b) => `${a}/${b.slice(2)}`) ?? null;

export default async function LeaguesPage() {
  const now = new Date();
  const db = getDatabase();
  const seasons = db ? await Promise.all(timelineLeagues.map((league) => leagueInfo(prismaSyncDatabase(db), league.slug, now).then((info) => shortSeason(info?.seasonName ?? null)).catch(() => null))) : timelineLeagues.map(() => null);
  return <NewsShell section="league"><div className="domain-page">
    <PageHead kicker="CÁC SÂN KHẤU LỚN" title="Bốn giải đấu. Vạn câu chuyện." text="Chọn nơi bạn muốn bắt nhịp bóng đá." />
    <div className="dp-league-grid">{timelineLeagues.map((league, index) => <Link className={`dp-league-tile league-tone-${index}`} key={league.slug} href={leagueHref(league.slug)}>
      <span aria-hidden="true">{league.mark}</span><small>{league.country.toUpperCase()}{seasons[index] ? ` · ${seasons[index]}` : ""}</small><h2>{league.label}</h2><p>Tin tức · Lịch thi đấu · BXH · Đội bóng</p><b>Khám phá giải đấu ↗</b>
    </Link>)}</div>
  </div></NewsShell>;
}
