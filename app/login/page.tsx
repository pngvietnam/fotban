import type { Metadata } from "next";
import Link from "next/link";
import { SportsShell } from "../../components/sports-shell";
import { LoginButton } from "../../components/account/account-controls";
import { authReadiness, safeReturnPath } from "../../lib/auth-policy";
import { env } from "../../lib/env";

export const metadata: Metadata = { title: "Đăng nhập | Fotban", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const ready = authReadiness(env, process.env.NODE_ENV).ready;
  return <SportsShell section="account"><div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><h1 className="text-2xl font-bold">Đăng nhập</h1><p className="my-5 text-sm leading-7 text-slate-600">Lưu CLB, cầu thủ và giải đấu bạn theo dõi. Bạn luôn có thể đọc bản tin, trận đấu và tin tức mà không cần tài khoản.</p>{params.error && <p role="alert" className="my-4 text-sm text-amber-900">Đăng nhập chưa hoàn tất. Vui lòng thử lại.</p>}{ready ? <LoginButton returnTo={safeReturnPath(params.returnTo)} /> : <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm leading-7 text-slate-700">Đăng nhập Google chưa được cấu hình trên môi trường này. Nội dung công khai vẫn hoạt động bình thường.</p>}<Link href="/" className="mt-5 inline-block rounded py-2 text-sm font-semibold underline underline-offset-4">Tiếp tục đọc bản tin</Link></div></SportsShell>;
}
