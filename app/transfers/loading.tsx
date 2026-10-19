import { TransferShell } from "@/components/transfers/transfer-shell";
import { NewsLoading } from "@/components/news/news-loading";
export default function Loading() { return <TransferShell><h1 className="mb-6 text-3xl font-bold">Chuyển nhượng</h1><NewsLoading label="Đang tải chuyển nhượng…" /></TransferShell>; }
