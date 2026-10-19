export function MatchLoading() {
  return <div className="py-10"><p role="status" className="text-sm font-medium text-slate-600">Đang tải trận đấu…</p><div aria-hidden="true" className="mt-6 grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="h-56 rounded-2xl border border-slate-200 bg-white"><div className="m-5 h-3 w-1/3 rounded bg-slate-100" /><div className="mx-5 mt-10 h-12 rounded bg-slate-100" /></div>)}</div></div>;
}
