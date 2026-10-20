"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

const viewKey = "fotban-match-view";
const pinKey = "fotban-pinned-matches";

/** Jumps the timeline to the picked day (the rest of the view is kept by the server-built link). */
export function TimelineDatePicker({ value, base }: { value: string; base: string }) {
  const router = useRouter();
  return <input type="date" value={value} aria-label="Đi đến ngày thi đấu" onChange={(event) => {
    const day = event.target.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const url = new URL(base, window.location.origin);
    url.searchParams.set("ngay", day); url.searchParams.delete("truoc"); url.searchParams.delete("sau");
    router.push(`${url.pathname}${url.search}`);
  }} />;
}

/** Remembers the schedule view so "Quay lại lịch đấu" on a match returns to the same league, day and filters. */
export function RememberSchedule() {
  useEffect(() => {
    try { sessionStorage.setItem(viewKey, `${window.location.pathname}${window.location.search}`); } catch { /* storage unavailable: the back link falls back to /matches */ }
  });
  return null;
}
/** Storage-backed values read through useSyncExternalStore; writes here notify every reader on the page. */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener); window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
function readStorage(storage: () => Storage, key: string) {
  try { return storage().getItem(key); } catch { return null; }
}
export function BackToSchedule({ children, className }: { children: ReactNode; className?: string }) {
  const saved = useSyncExternalStore(subscribe, () => readStorage(() => sessionStorage, viewKey), () => null);
  return <Link href={saved?.startsWith("/matches") ? saved : "/matches"} className={className}>{children}</Link>;
}

/** A per-reader star on a fixture, kept only in this browser. */
export function FixturePin({ id, label }: { id: string; label: string }) {
  const raw = useSyncExternalStore(subscribe, () => readStorage(() => localStorage, pinKey), () => null);
  const list = (() => { try { const value: unknown = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; } })();
  const pinned = list.includes(id);
  const toggle = () => {
    try { localStorage.setItem(pinKey, JSON.stringify(pinned ? list.filter((value) => value !== id) : [...list, id].slice(-200))); } catch { return; }
    listeners.forEach((listener) => listener());
  };
  return <button type="button" className={`md-fixture-pin ${pinned ? "selected" : ""}`} aria-label={`${pinned ? "Bỏ đánh dấu" : "Đánh dấu"} trận ${label}`} aria-pressed={pinned} onClick={toggle}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" /></svg>
  </button>;
}
