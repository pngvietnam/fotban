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
  return <SportsShell section="account"><div className="domain-page dp-login">
    <div className="dp-login-art"><span className="dp-kicker">FOTBAN · KHÁC MÀU ÁO, CHUNG ĐAM MÊ</span><h1>Bóng đá.<br />Theo cách của bạn.</h1><p>Theo đội bóng yêu thích.<br />Giữ lại câu chuyện đáng nhớ.<br />Không bỏ lỡ điều quan trọng.</p><span className="dp-login-ball" aria-hidden="true">f.</span></div>
    <div className="dp-panel">
      <h2>Chào mừng đến khán đài.</h2>
      <p className="dp-muted">Đọc công khai không cần tài khoản. Đăng nhập để giữ các mục theo dõi trên mọi thiết bị; những gì bạn đã chọn trên trình duyệt này sẽ được chuyển vào tài khoản.</p>
      {params.error && <p role="alert" className="dp-muted">Đăng nhập chưa hoàn tất. Vui lòng thử lại.</p>}
      {ready ? <LoginButton returnTo={safeReturnPath(params.returnTo)} /> : <p role="status" className="dp-muted">Đăng nhập Google chưa được cấu hình trên môi trường này. Nội dung công khai vẫn hoạt động bình thường.</p>}
      <Link className="dp-secondary" href="/following">Tiếp tục khám phá →</Link>
      <Link className="dp-back" href="/terms">Điều khoản & quyền riêng tư ↗</Link>
    </div>
  </div></SportsShell>;
}
