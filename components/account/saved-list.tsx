"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSavedStories, type SavedStory } from "../news/feed-actions";
import { Empty } from "../domain/domain-ui";

/** "Tin đã lưu": saved stories, newest first. Removing one offers "Hoàn tác" for a few seconds. */
export function SavedList() {
  const { ready, saved, set } = useSavedStories();
  const [removed, setRemoved] = useState<SavedStory | null>(null);
  useEffect(() => { if (!removed) return; const timer = setTimeout(() => setRemoved(null), 6000); return () => clearTimeout(timer); }, [removed]);
  if (!ready) return <div className="dp-panel" role="status" aria-busy="true"><p className="dp-muted">Đang mở tủ tin…</p></div>;
  const undo = <div className="dp-undo" role="status">{removed && <><span>Đã bỏ lưu “{removed.title}”.</span><button type="button" className="dp-secondary" onClick={() => { set(removed, true); setRemoved(null); }}>Hoàn tác</button></>}</div>;
  if (!saved.length) return <>{undo}<Empty title="Chưa có tin nào được lưu" text="Mở một bài viết và nhấn Lưu tin để đọc lại ở đây." href="/news" label="Khám phá tin tức" /></>;
  return <>{undo}<div className="dp-panel">{saved.map((item) => <div className="dp-saved-row" key={item.slug}>
    <Link href={`/news/${encodeURIComponent(item.slug)}`}><small>{item.publisher.toUpperCase()}</small><h3>{item.title}</h3><span>Đọc tiếp →</span></Link>
    <button type="button" className="dp-secondary" aria-label={`Bỏ lưu ${item.title}`} onClick={() => { set(item, false); setRemoved(item); }}>Bỏ lưu</button>
  </div>)}</div></>;
}
