"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-3xl p-6 py-16"><h1 className="text-2xl font-bold">Không thể tải trang</h1><p className="my-4">Vui lòng thử lại sau.</p><button className="rounded bg-emerald-700 px-5 py-3 text-white" onClick={reset}>Thử lại</button></main>;
}
