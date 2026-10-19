import type { MatchSummary } from "../../types/match-ui";

export function MatchAttribution({ matches }: { matches: MatchSummary[] }) {
  const sources = [...new Map(matches.flatMap((match) => match.attribution ? [[match.attribution.url, match.attribution] as const] : [])).values()];
  if (!sources.length) return null;
  return <aside aria-label="Nguồn dữ liệu" className="mt-8 border-t border-slate-200 pt-5 text-xs leading-6 text-slate-500">
    {sources.map((source) => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-slate-900">{source.text}<span className="sr-only"> (mở trong thẻ mới)</span></a></p>)}
    <p>Dữ liệu có thể có độ trễ. Thời gian cập nhật được ghi trên từng trận.</p>
  </aside>;
}
