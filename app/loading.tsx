import { SportsShell } from "../components/sports-shell";

export default function Loading() {
  return <SportsShell section="home"><h1 className="text-3xl font-bold">Bản tin sáng</h1><p role="status" className="mt-4 text-sm text-slate-600">Đang tải bản tin…</p><div aria-hidden="true" className="mt-6 h-36 rounded-2xl border border-slate-200 bg-white" /></SportsShell>;
}
