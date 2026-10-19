"use client";
import { useState } from "react";
import { safeCrestUrl } from "../../lib/crest";

const sizes = { sm: "h-8 w-8 rounded-lg text-[10px]", md: "h-11 w-11 rounded-xl text-sm", lg: "h-16 w-16 rounded-2xl text-xl sm:h-20 sm:w-20 sm:text-2xl" } as const;
const abbreviation = (name: string, tla?: string | null) => (tla?.trim() || name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("")).slice(0, 4).toLocaleUpperCase("vi-VN");

/** The club's crest. Letters appear only when the crest is missing or fails to load. */
export function TeamBadge({ name, tla, crestUrl, size = "sm" }: { name: string; tla?: string | null; crestUrl?: string | null; size?: keyof typeof sizes }) {
  const [failed, setFailed] = useState(false);
  const src = safeCrestUrl(crestUrl);
  if (src && !failed) return <span aria-hidden="true" className={`grid shrink-0 place-items-center bg-white ${sizes[size]}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked provider crest; not optimized, downloaded or stored by us */}
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain p-0.5" />
  </span>;
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center border border-slate-200 bg-slate-50 px-1 font-bold tracking-tight text-slate-600 ${sizes[size]}`}>{abbreviation(name, tla)}</span>;
}
