"use client";
import { TransferShell } from "@/components/transfers/transfer-shell";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <TransferShell><h1 className="text-2xl font-bold">Chưa thể tải chuyển nhượng</h1><p className="my-4 text-slate-600">Vui lòng thử lại sau.</p><button onClick={reset} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Thử lại</button></TransferShell>; }
