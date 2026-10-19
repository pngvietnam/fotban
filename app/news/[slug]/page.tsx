import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { newsMetadata } from "@/lib/news-presentation";
import { readNewsPage } from "@/services/news-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsDetailView } from "@/components/news/news-detail";
import { NewsState } from "@/components/news/news-state";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await readNewsPage((await params).slug);
  return newsMetadata(result.kind === "ready" ? result.story : null, env.NEXT_PUBLIC_APP_URL);
}
export default async function NewsDetailPage({ params }: Props) {
  const result = await readNewsPage((await params).slug);
  if (result.kind === "not-found") notFound();
  return <NewsShell>{result.kind === "ready" ? <NewsDetailView story={result.story} now={new Date()} /> : <><h1 className="sr-only">Tin tức chưa khả dụng</h1><NewsState kind="error" /></>}</NewsShell>;
}
