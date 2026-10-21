"use client";
import Link from "next/link";
import { useSavedStories } from "../news/feed-actions";
import { Empty } from "../domain/domain-ui";

/** "Tin đã lưu": the stories bookmarked in this browser, newest first. */
export function SavedList() {
  const { ready, saved, set } = useSavedStories();
  if (!ready) return <div className="dp-panel" role="status" aria-busy="true"><p className="dp-muted">Đang mở tủ tin…</p></div>;
  if (!saved.length) return <Empty title="Chưa có tin nào được lưu" text="Mở một bài viết và nhấn Lưu tin để đọc lại ở đây." href="/news" label="Khám phá tin tức" />;
  return <div className="dp-panel">{saved.map((item) => <div className="dp-saved-row" key={item.slug}>
    <Link href={`/news/${encodeURIComponent(item.slug)}`}><small>{item.publisher.toUpperCase()}</small><h3>{item.title}</h3><span>Đọc tiếp →</span></Link>
    <button type="button" className="dp-secondary" aria-label={`Bỏ lưu ${item.title}`} onClick={() => set(item, false)}>Bỏ lưu</button>
  </div>)}</div>;
}
