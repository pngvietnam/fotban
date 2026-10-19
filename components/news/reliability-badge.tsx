import type { NewsStory } from "../../types/news-ui";

const styles = {
  OFFICIAL: "border-emerald-200 bg-emerald-50 text-emerald-900",
  RELIABLE: "border-blue-200 bg-blue-50 text-blue-900",
  SOCIAL: "border-violet-200 bg-violet-50 text-violet-900",
  RUMOR: "border-amber-200 bg-amber-50 text-amber-950",
};
export function ReliabilityBadge({ reliability }: { reliability: NewsStory["reliability"] }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${reliability.disputed ? "border-rose-200 bg-rose-50 text-rose-900" : styles[reliability.label]}`}>
    <span aria-hidden="true">{reliability.disputed ? "!" : reliability.label === "OFFICIAL" ? "✓" : "●"}</span>
    {reliability.disputed ? reliability.badge.disputedVi ?? "Thông tin mâu thuẫn" : reliability.badge.labelVi}
  </span>;
}
