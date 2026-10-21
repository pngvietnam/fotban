import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { activeUser } from "../../lib/auth";
import { getDatabase } from "../../lib/db";
import { logger } from "../../lib/logger";
import { prismaSyncDatabase } from "../../lib/sync-database";
import { FollowingService, UserPreferenceService } from "../../services/following";
import { AccountView } from "../../components/account/account-view";
import { SportsShell } from "../../components/sports-shell";
import { Empty } from "../../components/domain/domain-ui";

export const metadata: Metadata = { title: "Tài khoản & sở thích | Fotban", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const Unavailable = () => <SportsShell section="account"><div className="domain-page"><Empty title="Tài khoản tạm thời chưa khả dụng" text="Vui lòng thử lại sau. Bạn vẫn có thể đọc nội dung công khai." href="/" label="Về Bảng tin" /></div></SportsShell>;

export default async function AccountPage() {
  let user;
  try { user = await activeUser(await headers()); } catch { logger.warn({ event: "account_session_unavailable" }); return <Unavailable />; }
  if (!user) redirect(`/login?returnTo=${encodeURIComponent("/account")}`);
  const db = getDatabase(); if (!db) return <Unavailable />;
  let data;
  try {
    const database = prismaSyncDatabase(db); const session = async () => user;
    const [follows, preferences] = await Promise.all([new FollowingService(database, session).list(), new UserPreferenceService(database, session).get()]);
    data = { follows, preferences };
  } catch { logger.warn({ event: "account_read_unavailable" }); }
  return data ? <AccountView user={user} follows={data.follows} preferences={data.preferences} /> : <Unavailable />;
}
