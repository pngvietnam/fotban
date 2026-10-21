"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Arrow and label of every back control; phones show the arrow only and keep the label for screen readers. */
export function BackLabel({ children }: { children: ReactNode }) {
  return <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5 M11 6l-6 6 6 6" /></svg><span className="fb-back-label">{children}</span></>;
}

/** "Quay lại": back to the page the reader came from on this site, otherwise to `fallback`. */
export function BackLink({ fallback, children, className = "fb-back" }: { fallback: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return <Link href={fallback} className={className} onClick={(event) => {
    let internal = false;
    try { internal = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin; } catch { internal = false; }
    if (internal && window.history.length > 1) { event.preventDefault(); router.back(); }
  }}><BackLabel>{children}</BackLabel></Link>;
}
