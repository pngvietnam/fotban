import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { transferMetadata } from "@/lib/transfer-presentation";
import { readTransferPage } from "@/services/transfer-page-data";
import { TransferShell } from "@/components/transfers/transfer-shell";
import { TransferDetail } from "@/components/transfers/transfer-detail";
import { TransferState } from "@/components/transfers/transfer-state";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const result = await readTransferPage((await params).slug); return transferMetadata(result.kind === "ready" ? result.transfer : null, env.NEXT_PUBLIC_APP_URL); }
export default async function TransferPage({ params }: Props) { const result = await readTransferPage((await params).slug); if (result.kind === "not-found") notFound(); return <TransferShell>{result.kind === "ready" ? <TransferDetail view={result.transfer} /> : <><h1 className="sr-only">Chuyển nhượng chưa khả dụng</h1><TransferState kind="error" /></>}</TransferShell>; }
