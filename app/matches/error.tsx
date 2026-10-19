"use client";

import { MatchShell } from "@/components/matches/match-shell";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <MatchShell><h1 className="text-2xl font-bold">Chưa thể tải trận đấu</h1><p role="alert" className="my-4 text-sm text-slate-600">Vui lòng thử lại sau.</p><button onClick={reset} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Thử lại</button></MatchShell>;
}
