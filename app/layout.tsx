import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Morning Brief",
  description: "Bản tin bóng đá buổi sáng bằng tiếng Việt.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className="bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">{children}</body></html>;
}
