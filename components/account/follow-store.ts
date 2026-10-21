"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type FollowType = "CLUB" | "PLAYER" | "COMPETITION";
export type FollowItem = { type: FollowType; entityId: string; name: string; crestUrl?: string | null };
type Viewer = { status: "loading" | "ready"; signedIn: boolean; follows: FollowItem[] };

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
const loadingViewer: Viewer = { status: "loading", signedIn: false, follows: [] };
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
let started = false;
/** One request per page load: signed-in readers get their account list; guests keep the browser list, and a guest who logs in has it merged into the account. */
function start() {
  if (started) return; started = true;
  void (async () => {
    try {
      let follows = await fetchAccountFollows();
      if (!follows) { setViewer({ status: "ready", signedIn: false, follows: [] }); return; }
      const local = parseGuest(readRaw());
      if (local.length) {
        for (const item of local) { try { await fetch("/api/following", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: item.type, entityId: item.entityId }) }); } catch { /* retried next load */ } }
        follows = (await fetchAccountFollows()) ?? follows;
        try { localStorage.removeItem(guestKey); } catch { /* ignore */ }
      }
      writeCookie([]);
      setViewer({ status: "ready", signedIn: true, follows });
    } catch { started = false; setViewer({ status: "ready", signedIn: false, follows: [] }); }
  })();
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
      if (next) setViewer({ status: "ready", signedIn: true, follows: next });
      refresh?.(); return true;
    } catch { return false; }
  }, [current.signedIn, follows, guest]);
  return { ready: current.status === "ready", signedIn: current.signedIn, follows, isFollowing, toggle };
}
