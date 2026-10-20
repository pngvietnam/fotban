"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

const likedKey = "fotban-liked-stories";
const savedKey = "fotban-saved-stories";
export type SavedStory = { slug: string; title: string; publisher: string; savedAt: string };

/** Browser lists (guest likes, saved stories) read through useSyncExternalStore; writes notify every reader on the page. */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener); window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
function parseList<T>(raw: string | null, valid: (item: unknown) => item is T): T[] {
  try { const value: unknown = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? value.filter(valid) : []; } catch { return []; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { return false; }
  listeners.forEach((listener) => listener()); return true;
}
const isString = (item: unknown): item is string => typeof item === "string";
const isSaved = (item: unknown): item is SavedStory => !!item && typeof item === "object" && typeof (item as SavedStory).slug === "string" && typeof (item as SavedStory).title === "string";

const Glyph = ({ name, size = 18 }: { name: "heart" | "share" | "bookmark"; size?: number }) => {
  const paths = { heart: "M12 20s-7-4.4-9-9.2C1.6 7.3 4 4 7.3 4c2 0 3.6 1.1 4.7 2.6C13.1 5.1 14.7 4 16.7 4 20 4 22.4 7.3 21 10.8 19 15.6 12 20 12 20z", share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7 M16 6l-4-4-4 4 M12 2v13", bookmark: "M6 3h12v18l-6-4-6 4z" };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
};

/**
 * "Thích": a signed-in reader's like is stored in the account and counted; a guest's stays in this
 * browser and is not counted (only real, stored likes are ever shown as a number).
 */
export function LikeButton({ articleId, signedIn, liked: initialLiked, count = 0, onCount }: { articleId: string; signedIn: boolean; liked: boolean; count?: number; onCount?: (count: number) => void }) {
  const guestLikes = parseList(useSyncExternalStore(subscribe, () => read(likedKey), () => null), isString);
  const [accountLiked, setAccountLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const liked = signedIn ? accountLiked : guestLikes.includes(articleId);
  const toggle = async () => {
    if (!signedIn) { write(likedKey, liked ? guestLikes.filter((id) => id !== articleId) : [...guestLikes, articleId].slice(-500)); return; }
    setBusy(true); setAccountLiked(!liked);
    try {
      const response = await fetch("/api/likes", { method: liked ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId }) });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { count?: number };
      if (typeof data.count === "number") onCount?.(data.count);
    } catch { setAccountLiked(liked); } finally { setBusy(false); }
  };
  return <button type="button" className={liked ? "is-selected" : ""} aria-pressed={liked} disabled={busy} onClick={toggle} title={signedIn ? undefined : "Lượt thích của khách chỉ lưu trên trình duyệt này"}><Glyph name="heart" />{liked ? "Đã thích" : "Thích"}{count > 0 && <span className="post-like-count" aria-label={`${count} lượt thích`}>{count}</span>}</button>;
}

/** Share through the device share sheet, or copy the link. */
export function ShareButton({ path, title, className }: { path: string; title: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const timer = setTimeout(() => setDone(false), 2500); return () => clearTimeout(timer); }, [done]);
  const share = async () => {
    const url = new URL(path, window.location.origin).href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setDone(true);
    } catch { /* cancelled or blocked: nothing to undo */ }
  };
  return <button type="button" className={className} onClick={share}><Glyph name="share" size={className ? 14 : 18} />{done ? "Đã chép liên kết" : "Chia sẻ"}</button>;
}

/** Bookmark a story in this browser ("Tin đã lưu"). */
export function SaveButton({ story, className = "post-save", label = false }: { story: Omit<SavedStory, "savedAt">; className?: string; label?: boolean }) {
  const saved = parseList(useSyncExternalStore(subscribe, () => read(savedKey), () => null), isSaved);
  const on = saved.some((item) => item.slug === story.slug);
  const toggle = () => write(savedKey, on ? saved.filter((item) => item.slug !== story.slug) : [{ ...story, savedAt: new Date().toISOString() }, ...saved].slice(0, 200));
  return <button type="button" className={`${className} ${on ? "is-selected" : ""}`} aria-pressed={on} aria-label={on ? "Bỏ lưu tin" : "Lưu tin"} onClick={toggle}>{label ? (on ? "Đã lưu ✓" : "+ Lưu tin") : <Glyph name="bookmark" />}</button>;
}

/** Thích (with the stored like total beside it) and Chia sẻ in one compact group. */
export function PostActions({ articleId, signedIn, liked, count, sharePath, title }: { articleId: string; signedIn: boolean; liked: boolean; count: number; sharePath: string; title: string }) {
  const [total, setTotal] = useState(count);
  return <div className="post-actions compact"><LikeButton articleId={articleId} signedIn={signedIn} liked={liked} count={total} onCount={setTotal} /><ShareButton path={sharePath} title={title} /></div>;
}

/** "Loại tin" and "Giải đấu" as disclosure menus of links (prototype v2 FeedControls). */
export function FeedFilterMenus({ menus, clearHref, countText }: { menus: { key: string; label: string; current: string; options: { label: string; href: string; active: boolean }[] }[]; clearHref: string | null; countText: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return <div className="feed-controls" onKeyDown={(event) => { if (event.key === "Escape") setOpen(null); }}>
    <div className="feed-controls-fields">{menus.map((menu) => <div className="feed-filter-field" key={menu.key}>
      <button type="button" className="fb-button fb-button-secondary" aria-expanded={open === menu.key} aria-controls={`feed-options-${menu.key}`} onClick={() => setOpen(open === menu.key ? null : menu.key)}>{menu.current}<span aria-hidden="true">⌄</span></button>
      {open === menu.key && <nav className="feed-filter-options" id={`feed-options-${menu.key}`} aria-label={menu.label}>{menu.options.map((option) => <Link key={option.href} href={option.href} className={`fb-button ${option.active ? "fb-button-primary" : "fb-button-ghost"}`} aria-current={option.active ? "true" : undefined} onClick={() => setOpen(null)}>{option.label}</Link>)}</nav>}
    </div>)}{clearHref && <Link className="fb-button fb-button-ghost" href={clearHref}>Xóa lọc</Link>}</div>
    <span className="fb-text fb-text-caption feed-result-count">{countText}</span>
  </div>;
}
