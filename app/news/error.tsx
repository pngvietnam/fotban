"use client";
import { NewsShell } from "@/components/news/news-shell";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <NewsShell><h1 className="text-2xl font-bold">Chưa thể tải tin tức</h1><p className="my-4 text-slate-600">Vui lòng thử lại sau.</p><button onClick={reset} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Thử lại</button></NewsShell>;
}
