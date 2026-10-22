import { env } from "@/lib/env";
import { clubCalendar } from "@/lib/club-calendar";
import { clubIdFromSlug } from "@/services/club-hub";
import { readClubCalendar } from "@/services/club-page-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Thêm vào lịch": the club's upcoming matches as an .ics file, from the stored fixtures. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!clubIdFromSlug(slug)) return new Response("Not found", { status: 404 });
  const data = await readClubCalendar(slug);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(clubCalendar(data.club.name, data.upcoming, env.NEXT_PUBLIC_APP_URL), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.ics"`, "Cache-Control": "private, max-age=900", "X-Robots-Tag": "noindex" },
  });
}
