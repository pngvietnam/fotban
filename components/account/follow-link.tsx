import Link from "next/link";
import type { FollowTarget } from "../../lib/auth-policy";

// Public components remain session-free and server-rendered. Account resolves state privately.
/** `button` is the prototype's "+ Theo dõi" in page headers; the default is the text link used in lists. */
export function FollowLink({ type, entityId, name, variant = "text" }: FollowTarget & { name: string; variant?: "text" | "button" }) {
  const href = `/account?type=${type}&entityId=${encodeURIComponent(entityId)}`;
  if (variant === "button") return <Link href={href} className="dp-primary dp-follow-slot" aria-label={`Theo dõi ${name}`}>+ Theo dõi</Link>;
  return <Link href={href} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100" aria-label={`Theo dõi ${name}`}>Theo dõi {name}</Link>;
}
