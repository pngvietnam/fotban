"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="vi"><body><main><h1>Đã xảy ra lỗi</h1><p>Vui lòng thử lại sau.</p><button onClick={reset}>Thử lại</button></main></body></html>;
}
