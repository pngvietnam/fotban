"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FollowTarget } from "../../lib/auth-policy";
import { useFollows } from "./follow-store";

/**
 * Follow toggle. Guests save to this browser (and sync to the account when they log in); signed-in readers save to the account.
 * `button` is the prototype's "+ Theo dõi" in page headers; the default is the text button used in lists.
 */
export function FollowLink({ type, entityId, name, crestUrl, variant = "text" }: FollowTarget & { name: string; crestUrl?: string | null; variant?: "text" | "button" }) {
  const router = useRouter();
  const { ready, isFollowing, toggle } = useFollows();
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const on = ready && isFollowing(type, entityId);
  const onClick = async () => { setBusy(true); setFailed(false); const ok = await toggle({ type, entityId, name, crestUrl }, router.refresh); setFailed(!ok); setBusy(false); };
  const label = `${on ? "Bỏ theo dõi" : "Theo dõi"} ${name}`;
  const hint = failed ? <span role="status" className="sr-only">Chưa thể cập nhật theo dõi.</span> : null;
  if (variant === "button") return <><button type="button" onClick={onClick} disabled={busy} aria-pressed={on} aria-label={label} className={`dp-primary dp-follow-slot ${on ? "following" : ""}`}>{on ? "Đang theo dõi ✓" : "+ Theo dõi"}</button>{hint}</>;
  return <><button type="button" onClick={onClick} disabled={busy} aria-pressed={on} aria-label={label} className={`inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-xs font-semibold ${on ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>{on ? "Đang theo dõi" : "Theo dõi"} {name}</button>{hint}</>;
}
