import type { Metadata } from "next";
import { DragScroll } from "@/components/ui/drag-scroll";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "../styles/fotban/tokens.css";
import "../styles/fotban/components.css";
import "../styles/fotban/shell.css";
import "../styles/fotban/matches.css";
import "../styles/fotban/match-detail.css";
import "../styles/fotban/home.css";
import "../styles/fotban/news.css";
import "../styles/fotban/domain.css";

// Self-hosted at build time by next/font; the prototype's typeface, with Vietnamese glyphs.
const beVietnam = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-be-vietnam", display: "swap" });

export const metadata: Metadata = {
  title: "Fotban",
  description: "Không chỉ tỷ số. Cả câu chuyện. Tin bóng đá, lịch đấu và kết quả bằng tiếng Việt.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" className={beVietnam.variable}><body className="bg-[#f7f8fa] text-[#192920]">{children}<DragScroll /></body></html>;
}
