import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readTransferDossier } from "@/services/transfer-board-data";
import { TransferShell } from "@/components/transfers/transfer-shell";
import { TransferState } from "@/components/transfers/transfer-state";
import { TransferDossier } from "@/components/transfers/dossier";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await readTransferDossier((await params).slug);
  if (result.kind !== "ready") return { title: "Không tìm thấy hồ sơ chuyển nhượng | Fotban", robots: { index: false, follow: false } };
  // The page carries publisher headlines, so it is not indexed.
  return { title: `${result.data.player.name}: chuyển nhượng | Fotban`, description: `Hồ sơ chuyển nhượng của ${result.data.player.name}: CLB, hợp đồng, giá trị và tin báo chí.`, robots: { index: false, follow: true } };
}
export default async function TransferPage({ params }: Props) {
  const result = await readTransferDossier((await params).slug);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <TransferShell><h1 className="sr-only">Hồ sơ chuyển nhượng chưa khả dụng</h1><TransferState kind="error" /></TransferShell>;
  return <TransferShell><TransferDossier data={result.data} now={new Date()} /><p className="sr-only"><Link href="/transfers">Về thị trường chuyển nhượng</Link></p></TransferShell>;
}
