import Link from "next/link";
import type { NewsSourceView, NewsStory } from "../../types/news-ui";
import { languageLabels, newsAbsoluteTime, newsRelativeTime, safeNewsUrl, storyLabels, tierLabels } from "../../lib/news-presentation";
import { NewsEntities, TransferPreview } from "./news-card";
import { ReliabilityBadge } from "./reliability-badge";
import { NewsState } from "./news-state";
import { FollowLink } from "../account/follow-link";

export function SourceEntry({ source, index }: { source: NewsSourceView; index: number }) {
  const url = safeNewsUrl(source.url); const licenseUrl = safeNewsUrl(source.licenseUrl); const revisionUrl = safeNewsUrl(source.revisionUrl);
  return <li id={`source-${index + 1}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
    <div className="mb-2 flex flex-wrap items-center gap-2"><span aria-hidden="true" className="text-xs font-bold text-slate-600">{String(index + 1).padStart(2, "0")}</span><h3 className="font-bold">{source.name}</h3><span className="text-xs text-slate-500">{tierLabels[source.tier] ?? "Chưa rõ mức thẩm định"}</span></div>
    <p className="mb-2 text-sm leading-6"><span className="sr-only">Tiêu đề gốc: </span><span lang={/^(en|es|vi)$/.test(source.language) ? source.language : undefined}>{source.originalTitle}</span></p>
    <p className="text-xs leading-6 text-slate-500">{languageLabels[source.language] ?? "Ngôn ngữ khác"} · {source.publishedAt ? <time dateTime={source.publishedAt}>{newsAbsoluteTime(source.publishedAt, source.dateOnly)}</time> : "Chưa rõ thời điểm"}</p>
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Đọc bản gốc từ ${source.name}: ${source.originalTitle} (mở thẻ mới)`} className="my-2 inline-block rounded py-2 text-sm font-semibold underline underline-offset-4">Đọc nguồn gốc <span aria-hidden="true">↗</span></a> : <p className="my-3 text-sm text-slate-500">Liên kết nguồn chưa khả dụng</p>}
    <div className="mt-2 border-t border-slate-100 pt-3 text-xs leading-6 text-slate-600">
      <p>Giấy phép: {licenseUrl ? <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" aria-label={`Giấy phép ${source.licenseName} của ${source.name} (mở thẻ mới)`}>{source.licenseName}</a> : source.licenseName}</p>
      <p className="break-words">Ghi công nguồn: {source.attribution}</p>
      {revisionUrl && <a href={revisionUrl} target="_blank" rel="noopener noreferrer" className="inline-block py-2 underline underline-offset-4" aria-label={`Phiên bản nguồn của ${source.name} (mở thẻ mới)`}>Phiên bản nguồn được sử dụng ↗</a>}
      <p>Thay đổi: tóm tắt / biên tập tiếng Việt; không tái bản toàn văn.</p>
    </div>
  </li>;
}
export function NewsDetailView({ story, now }: { story: NewsStory; now: Date }) {
  if (!story.titleVi?.trim() || !story.summaryVi?.trim()) return <NewsState kind="pending" />;
  return <div className="mx-auto max-w-4xl">
    <nav aria-label="Đường dẫn" className="mb-6 text-sm"><Link href="/news" className="inline-block rounded py-2 font-semibold text-slate-600 hover:underline">← Tất cả tin tức</Link></nav>
    <article>
      <header className="mb-6">
        <div className="mb-5 flex flex-wrap items-center gap-3"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{storyLabels[story.storyType] ?? "Bóng đá"}</span><ReliabilityBadge reliability={story.reliability} /></div>
        <h1 className="break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{story.titleVi}</h1>
        <p className="mt-5 text-xs leading-6 text-slate-500">Cập nhật <time dateTime={story.updatedAt} title={newsAbsoluteTime(story.updatedAt)}>{newsRelativeTime(story.updatedAt, now)}</time> · Giờ Việt Nam (UTC+7)</p>
        <p className="text-xs leading-6 text-slate-500">Nguồn công bố: <time dateTime={story.publishedAt}>{newsAbsoluteTime(story.publishedAt, story.dateOnly)}</time></p>
      </header>
      <section aria-labelledby="story-summary" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="story-summary" className="text-sm font-bold">Tóm tắt tiếng Việt</h2><span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{story.summaryMethod === "AI" ? "AI hỗ trợ · Đã kiểm duyệt" : "Trích lược · Đã kiểm duyệt"}</span></div>
        <p className="break-words text-lg leading-9 text-slate-800">{story.summaryVi}</p>
        <a href="#sources" className="mt-4 inline-block rounded py-2 text-sm font-semibold text-slate-600 underline underline-offset-4">Xem nguồn và căn cứ ↓</a>
        <div className="mt-3 border-t border-slate-100 pt-4"><NewsEntities story={story} /></div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Theo dõi thực thể liên quan">{story.entities.filter((entity) => entity.id).map((entity) => <FollowLink key={`${entity.kind}:${entity.id}`} entityId={entity.id!} type={entity.kind === "club" ? "CLUB" : entity.kind === "player" ? "PLAYER" : "COMPETITION"} name={entity.name} />)}</div>
      </section>
      <aside aria-label="Trạng thái thông tin" className="my-5 rounded-xl border border-slate-200 px-5 py-4 text-sm leading-7 text-slate-700">
        <p className="font-semibold">{story.reliability.badge.certaintyVi}</p>
        <p>{story.reliability.disputed ? "Các nguồn còn mâu thuẫn; không xem nội dung này là kết luận đã được xác nhận." : story.reliability.label === "SOCIAL" ? "Đây là ý kiến cộng đồng, không phải xác nhận sự kiện." : story.reliability.label === "RUMOR" ? "Thông tin chưa được xác nhận chính thức. Giữ nguyên mức độ chưa chắc chắn của nguồn." : story.reliability.label === "OFFICIAL" ? "Có căn cứ xác nhận trực tiếp đã được kiểm duyệt. Xem nguồn bên dưới." : "Báo chí đáng tin cậy đưa tin; không đồng nghĩa với xác nhận chính thức."}</p>
      </aside>
      <TransferPreview story={story} />
      <section id="sources" aria-labelledby="sources-title" className="scroll-mt-6 pt-8">
        <h2 id="sources-title" className="text-xl font-bold">Nguồn & căn cứ</h2>
        <p className="mb-5 mt-2 text-sm leading-7 text-slate-600">{story.sourceCount} nguồn được phép sử dụng{story.independentSourceCount > 1 ? ` · ${story.independentSourceCount} nguồn độc lập` : ". Các bài cùng nguồn gốc không được tính là xác nhận độc lập."}</p>
        <ol className="grid gap-4">{story.sources.map((source, index) => <SourceEntry key={source.key} source={source} index={index} />)}</ol>
      </section>
    </article>
  </div>;
}
