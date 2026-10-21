import type { Metadata } from "next";
import { getDatabase } from "../../../lib/db";
import { logger } from "../../../lib/logger";
import { prismaSyncDatabase } from "../../../lib/sync-database";
import { followCatalog, type CatalogItem } from "../../../services/follow-catalog";
import { SportsShell } from "../../../components/sports-shell";
import { Empty, PageHead } from "../../../components/domain/domain-ui";
import { FollowManager } from "../../../components/account/follow-manager";

export const metadata: Metadata = { title: "Quản lý theo dõi | Fotban", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ManageFollowingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = (await searchParams).q;
  const search = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const db = getDatabase();
  let items: CatalogItem[] | null = null;
  if (db) { try { items = await followCatalog(prismaSyncDatabase(db), new Date(), search); } catch { logger.warn({ event: "follow_catalog_unavailable" }); } }
  return <SportsShell section="following"><div className="domain-page">
    <PageHead kicker="KHÔNG GIAN CỦA BẠN" title="Quản lý theo dõi." text="Chọn điều bạn quan tâm để bắt nhịp bóng đá theo cách riêng." />
    {items ? <FollowManager items={items} search={search} /> : <Empty title="Danh sách tạm thời chưa khả dụng" text="Vui lòng thử lại sau ít phút." href="/following" label="Về Bảng tin của tôi" />}
  </div></SportsShell>;
}
