import { env } from "@/lib/env";
import { homepageMetadata } from "@/lib/homepage-presentation";
import { readHomepage } from "@/services/homepage-page-data";
import { MorningHomepage } from "@/components/home/morning-homepage";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams;
  return homepageMetadata(env.NEXT_PUBLIC_APP_URL, params.preview !== undefined);
}
export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  return <MorningHomepage result={await readHomepage(params.preview)} now={new Date()} />;
}
