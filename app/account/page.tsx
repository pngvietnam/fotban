import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { activeUser } from "../../lib/auth";
import { followTargetSchema } from "../../lib/auth-policy";
import { getDatabase } from "../../lib/db";
import { logger } from "../../lib/logger";
import { prismaSyncDatabase } from "../../lib/sync-database";
import { FollowingService, UserPreferenceService, type FollowedEntity } from "../../services/following";
import { AccountView } from "../../components/account/account-view";
import { SportsShell } from "../../components/sports-shell";

export const metadata: Metadata = { title: "Tài khoản & theo dõi | Football Morning Brief", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(); for (const key of ["q", "type", "entityId"]) if (typeof params[key] === "string") query.set(key, params[key]);
  const returnTo = `/account${query.size ? `?${query}` : ""}`;
  let user;
  try { user = await activeUser(await headers()); } catch { logger.warn({ event: "account_session_unavailable" }); return <AccountUnavailable />; }
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  const db = getDatabase(); if (!db) return <AccountUnavailable />;
  let view: React.ComponentProps<typeof AccountView> | undefined;
  try {
    const database = prismaSyncDatabase(db); const session = async () => user;
    const following = new FollowingService(database, session); const prefs = new UserPreferenceService(database, session);
    const search = typeof params.q === "string" ? params.q.slice(0, 80) : "";
    const [follows, catalog, preferences] = await Promise.all([following.list(), following.catalog(search), prefs.get()]);
    const target = followTargetSchema.safeParse({ type: params.type, entityId: params.entityId });
    let selected: FollowedEntity | undefined;
    if (target.success) {
      const type = target.data.type; const entityId = target.data.entityId;
      const row = type === "CLUB" ? await db.club.findUnique({ where: { id: entityId }, select: { name: true } }) : type === "PLAYER" ? await db.player.findUnique({ where: { id: entityId }, select: { name: true } }) : await db.league.findFirst({ where: { id: entityId, slug: { in: ["premier-league", "la-liga"] } }, select: { name: true } });
      if (row) selected = { type, entityId, name: row.name, following: follows.some((e) => e.type === type && e.entityId === entityId) };
    }
    view = { user, follows, catalog, preferences, search, selected };
  } catch { logger.warn({ event: "account_read_unavailable" }); }
  return view ? <AccountView {...view} /> : <AccountUnavailable />;
}
function AccountUnavailable() { return <SportsShell section="account"><h1 className="text-2xl font-bold">Tài khoản tạm thời chưa khả dụng</h1><p className="mt-4 text-sm text-slate-600">Vui lòng thử lại sau. Bạn vẫn có thể đọc nội dung công khai.</p></SportsShell>; }
