import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-3xl p-6 py-16"><h1 className="text-2xl font-bold">Không tìm thấy trang</h1><Link className="mt-6 inline-block underline" href="/">Về trang chủ</Link></main>;
}
