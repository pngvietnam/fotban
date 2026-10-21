"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type FollowType = "CLUB" | "PLAYER" | "COMPETITION";
export type FollowItem = { type: FollowType; entityId: string; name: string; crestUrl?: string | null };
export type SavedStory = { slug: string; title: string; publisher: string; savedAt: string };
type Viewer = { status: "loading" | "ready"; signedIn: boolean; follows: FollowItem[]; saved: SavedStory[] };
/** Browser keys of a guest's saved stories and likes (written by feed-actions); merged into the account on login. */
export const savedKey = "fotban-saved-stories";
export const likedKey = "fotban-liked-stories";

const guestKey = "fotban-follows";
const cookieName = "fotban-follows";
const maxGuestFollows = 40;
const prefix = { CLUB: "C", PLAYER: "P", COMPETITION: "L" } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  listeners.add(listener); window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
const loadingViewer: Viewer = { status: "loading", signedIn: false, follows: [], saved: [] };
let viewer: Viewer = loadingViewer;
const setViewer = (next: Viewer) => { viewer = next; notify(); };

const isItem = (item: unknown): item is FollowItem => !!item && typeof item === "object" && ["CLUB", "PLAYER", "COMPETITION"].includes((item as FollowItem).type) && typeof (item as FollowItem).name === "string" && uuid.test((item as FollowItem).entityId);
const readRaw = () => { try { return localStorage.getItem(guestKey); } catch { return null; } };
const parseGuest = (raw: string | null): FollowItem[] => { try { const value: unknown = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? value.filter(isItem).slice(0, maxGuestFollows) : []; } catch { return []; } };
/** The server renders "Bảng tin của tôi" for guests from this cookie: only ids, never names. */
function writeCookie(items: FollowItem[]) {
  const value = items.map((item) => `${prefix[item.type]}.${item.entityId}`).join("|");
  document.cookie = `${cookieName}=${value}; path=/; max-age=${items.length ? 31536000 : 0}; SameSite=Lax`;
}
function writeGuest(items: FollowItem[]) {
  try { localStorage.setItem(guestKey, JSON.stringify(items)); } catch { /* storage blocked: the cookie below still carries the ids */ }
  writeCookie(items); notify();
}

async function fetchAccountFollows(): Promise<FollowItem[] | null> {
  const response = await fetch("/api/following", { headers: { Accept: "application/json" }, cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(String(response.status));
  return ((await response.json()) as { follows?: FollowItem[] }).follows ?? [];
}
const readList = (key: string): unknown[] => { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };
async function fetchAccountSaved(): Promise<SavedStory[]> {
  try { const response = await fetch("/api/saved", { headers: { Accept: "application/json" }, cache: "no-store" }); return response.ok ? ((await response.json()) as { saved?: SavedStory[] }).saved ?? [] : []; } catch { return []; }
}
/** A guest's saved stories and likes join the account once, then the browser copies are removed. A failed request keeps them for the next load. */
async function mergeGuestStories() {
  const saved = readList(savedKey).flatMap((item) => item && typeof item === "object" && typeof (item as SavedStory).slug === "string" ? [(item as SavedStory).slug] : []).slice(0, 200);
  const liked = readList(likedKey).filter((id): id is string => typeof id === "string").slice(-500);
  if (!saved.length && !liked.length) return;
  try {
    const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved, liked }) });
    if (response.ok) { try { localStorage.removeItem(savedKey); localStorage.removeItem(likedKey); } catch { /* ignore */ } notify(); }
  } catch { /* retried next load */ }
}
let started = false;
/** One request per page load: signed-in readers get their account list; guests keep the browser list, and a guest who logs in has it merged into the account. */
function start() {
  if (started) return; started = true;
  void (async () => {
    try {
      let follows = await fetchAccountFollows();
      if (!follows) { setViewer({ status: "ready", signedIn: false, follows: [], saved: [] }); return; }
      const local = parseGuest(readRaw());
      if (local.length) {
        for (const item of local) { try { await fetch("/api/following", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: item.type, entityId: item.entityId }) }); } catch { /* retried next load */ } }
        follows = (await fetchAccountFollows()) ?? follows;
        try { localStorage.removeItem(guestKey); } catch { /* ignore */ }
      }
      writeCookie([]);
      await mergeGuestStories();
      setViewer({ status: "ready", signedIn: true, follows, saved: await fetchAccountSaved() });
    } catch { started = false; setViewer({ status: "ready", signedIn: false, follows: [], saved: [] }); }
  })();
}

/** Saved stories: the account list when signed in (shared with every reader on the page), otherwise written by the caller to the browser. */
export function useAccountSaved() {
  const current = useSyncExternalStore(subscribe, () => viewer, () => loadingViewer);
  useEffect(start, []);
  const save = useCallback(async (story: Omit<SavedStory, "savedAt">, on: boolean) => {
    const before = viewer;
    setViewer({ ...before, saved: on ? [{ ...story, savedAt: new Date().toISOString() }, ...before.saved.filter((item) => item.slug !== story.slug)] : before.saved.filter((item) => item.slug !== story.slug) });
    try {
      const response = await fetch("/api/saved", { method: on ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: story.slug }) });
      if (!response.ok) throw new Error(String(response.status));
    } catch { setViewer(before); }
  }, []);
  return { ready: current.status === "ready", signedIn: current.signedIn, saved: current.saved, save };
}

/** Who is browsing and what they follow: the account list when signed in, otherwise this browser's list. */
export function useFollows() {
  const current = useSyncExternalStore(subscribe, () => viewer, () => loadingViewer);
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  useEffect(start, []);
  const guest = useMemo(() => parseGuest(raw), [raw]);
  const follows = current.signedIn ? current.follows : guest;
  const isFollowing = useCallback((type: FollowType, entityId: string) => follows.some((item) => item.type === type && item.entityId === entityId), [follows]);
  /** `refresh` re-renders the server parts of the page (the caller passes router.refresh; the shell never needs the router). */
  const toggle = useCallback(async (item: FollowItem, refresh?: () => void) => {
    const on = follows.some((entry) => entry.type === item.type && entry.entityId === item.entityId);
    if (!current.signedIn) {
      if (!on && guest.length >= maxGuestFollows) return false;
      writeGuest(on ? guest.filter((entry) => !(entry.type === item.type && entry.entityId === item.entityId)) : [...guest, { type: item.type, entityId: item.entityId, name: item.name, crestUrl: item.crestUrl ?? null }]);
      refresh?.(); return true;
    }
    try {
      const response = await fetch("/api/following", { method: on ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: item.type, entityId: item.entityId }) });
      if (!response.ok) return false;
      const next = await fetchAccountFollows();
      if (next) setViewer({ ...viewer, follows: next });
      refresh?.(); return true;
    } catch { return false; }
  }, [current.signedIn, follows, guest]);
  return { ready: current.status === "ready", signedIn: current.signedIn, follows, isFollowing, toggle };
}
