import type { Metadata } from "next";
import { SportsShell } from "../../components/sports-shell";
import { PageHead } from "../../components/domain/domain-ui";
import { SavedList } from "../../components/account/saved-list";

export const metadata: Metadata = { title: "Tin đã lưu | Fotban", robots: { index: false, follow: false } };

export default function SavedPage() {
  return <SportsShell section="saved"><div className="domain-page">
    <PageHead kicker="TỦ TIN CỦA BẠN" title="Những chuyện muốn đọc lại." text="Khách lưu tin trên trình duyệt này; đăng nhập để giữ trên mọi thiết bị." />
    <SavedList />
  </div></SportsShell>;
}
