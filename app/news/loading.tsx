import { NewsShell } from "@/components/news/news-shell";
import { NewsLoading } from "@/components/news/news-loading";
export default function Loading() { return <NewsShell><h1 className="mb-6 text-3xl font-bold">Tin bóng đá</h1><NewsLoading /></NewsShell>; }
