"use client";
import { useState } from "react";
import { safePhotoUrl } from "../../lib/player-photo";

const sizes = { sm: "h-8 w-8 rounded-lg", md: "h-11 w-11 rounded-xl", lg: "h-24 w-24 rounded-2xl sm:h-28 sm:w-28" } as const;
/** A neutral person outline (our own drawing) for players without a free-licence photo; never letters. */
function Silhouette() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full p-[18%] text-slate-300" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" /></svg>;
}
/** The player's photo. The file stays on Wikimedia's servers; credit is shown on the player page and the credits page. */
export function PlayerPhoto({ photoUrl, size = "sm" }: { photoUrl?: string | null; size?: keyof typeof sizes }) {
  const [failed, setFailed] = useState(false);
  const src = safePhotoUrl(photoUrl);
  return <span aria-hidden="true" className={`block shrink-0 overflow-hidden bg-slate-100 ${sizes[size]}`}>
    {src && !failed
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked Wikimedia thumbnail; not downloaded or stored by us
      ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
      : <Silhouette />}
  </span>;
}
