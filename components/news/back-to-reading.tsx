"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Returns to the page the reader came from on this site (keeping its place); otherwise opens Tin tức. */
export function BackToReading({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  return <Link href="/news" className={className} onClick={(event) => {
    let internal = false;
    try { internal = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin; } catch { internal = false; }
    if (internal && window.history.length > 1) { event.preventDefault(); router.back(); }
  }}>{children}</Link>;
}
