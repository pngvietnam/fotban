export function NewsLoading({ label = "Đang tải tin tức…" }: { label?: string }) {
  return <div role="status" aria-live="polite" aria-busy="true"><p className="mb-5 text-sm text-slate-600">{label}</p><div aria-hidden="true" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((key) => <div key={key} className="h-64 rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 h-5 w-28 rounded bg-slate-100" /><div className="mb-3 h-6 rounded bg-slate-100" /><div className="h-6 w-3/4 rounded bg-slate-100" /></div>)}</div></div>;
}
