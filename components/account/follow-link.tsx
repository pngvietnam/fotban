import Link from "next/link";
import type { FollowTarget } from "../../lib/auth-policy";

// Public components remain session-free and server-rendered. Account resolves state privately.
export function FollowLink({ type, entityId, name }: FollowTarget & { name: string }) {
  return <Link href={`/account?type=${type}&entityId=${encodeURIComponent(entityId)}`} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100" aria-label={`Theo dõi ${name}`}>Theo dõi {name}</Link>;
}
