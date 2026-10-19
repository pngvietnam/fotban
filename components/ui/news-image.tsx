"use client";
import { useState } from "react";

/** A publisher's feed image, loaded by the reader's browser from the publisher's own host (never stored by us).
 * The server has already limited the address to the publisher's hosts. It disappears entirely if it fails to
 * load; credit is given by the caller. */
export function NewsImage({ src, className = "" }: { src: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || !src.startsWith("https://") || failed) return null;
  return <span aria-hidden="true" className={`block overflow-hidden bg-slate-100 ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked publisher image; not optimized, downloaded or stored by us */}
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
  </span>;
}
