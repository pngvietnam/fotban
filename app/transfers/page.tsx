import type { Metadata } from "next";
import Link from "next/link";
import { readTransferBoard } from "@/services/transfer-board-data";
import { TransferShell } from "@/components/transfers/transfer-shell";
import { TransferBoard, parseBoardFilter } from "@/components/transfers/market";
import { PageHead } from "@/components/domain/domain-ui";
import { NewsState } from "@/components/news/news-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chuyển nhượng | Fotban", description: "Theo dõi chuyển nhượng: thương vụ đã ghi nhận trong hồ sơ, tin đàm phán và tin đồn, kèm trạng thái theo cách báo chí đưa tin." };
const Strip = ({ items }: { items: { value: number; label: string }[] }) => <div className="dp-stat-strip">{items.map((item) => <div key={item.label}><b>{String(item.value).padStart(2, "0")}</b><span>{item.label}</span></div>)}<span>CLB đi → CLB đến · EUR</span></div>;

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filter = parseBoardFilter(params.tt);
  const all = params.hien === "tat-ca";
  if (!filter || (params.hien !== undefined && !all)) return <TransferShell><h1 className="sr-only">Chuyển nhượng</h1><NewsState kind="invalid" /></TransferShell>;
  const now = new Date();
  const { rows, failed } = await readTransferBoard(now);
  return <TransferShell><div className="domain-page">
    <PageHead kicker="FOTBAN MERCATO" title="Thị trường không bao giờ ngủ." text="Theo dõi từng diễn biến. Phân biệt tin đồn với hồ sơ chuyển nhượng đã ghi nhận." />
    {failed && !rows.length ? <div className="dp-empty" role="alert"><span aria-hidden="true">f.</span><h3>Chưa thể tải dữ liệu chuyển nhượng</h3><p>Vui lòng thử lại sau ít phút.</p><Link className="dp-primary" href="/news">Đọc tin tức →</Link></div> : <>
      <Strip items={[{ value: rows.length, label: "Thương vụ" }, { value: rows.filter((row) => row.status === "recorded").length, label: "Đã ghi nhận" }, { value: rows.filter((row) => row.status === "talks").length, label: "Đang đàm phán" }, { value: rows.filter((row) => row.status === "rumor").length, label: "Tin đồn" }]} />
      <TransferBoard rows={rows} filter={filter} show={all ? 60 : 8} now={now} />
    </>}
  </div></TransferShell>;
}
