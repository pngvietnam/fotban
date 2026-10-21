import type { Metadata } from "next";
import { readPhotoCredits } from "@/services/photo-credits";
import { SportsShell } from "@/components/sports-shell";
import { NewsState } from "@/components/news/news-state";
import { playerPath } from "@/lib/player-presentation";
import Link from "next/link";

export const metadata: Metadata = { title: "Ghi công ảnh | Fotban", description: "Tác giả và giấy phép của ảnh cầu thủ trên Fotban.", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";
export default async function PhotoCreditsPage() {
  const credits = await readPhotoCredits();
  if (!credits) return <SportsShell section="home"><h1 className="sr-only">Ghi công ảnh chưa khả dụng</h1><NewsState kind="error" /></SportsShell>;
  return <SportsShell section="home">
    <header className="mb-6 max-w-2xl"><h1 className="text-3xl font-bold tracking-tight">Ghi công ảnh</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">Ảnh cầu thủ lấy từ <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Wikimedia Commons</a> theo giấy phép tự do (CC0, phạm vi công cộng, CC BY hoặc CC BY-SA). Ảnh chỉ được ghép với cầu thủ khi ngày sinh trên Wikidata trùng với dữ liệu của FotBan. Ảnh không được lưu trên máy chủ FotBan; trình duyệt của bạn tải trực tiếp từ Wikimedia.</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">Logo câu lạc bộ do football-data.org cung cấp và thuộc quyền sở hữu của các câu lạc bộ, giải đấu tương ứng.</p></header>
    {credits.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">Chưa có ảnh nào được hiển thị.</p>
      : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4"><table className="w-full min-w-[480px] text-sm"><caption className="sr-only">Ghi công ảnh cầu thủ</caption>
        <thead className="text-left text-[11px] text-slate-500"><tr><th scope="col" className="py-2">Cầu thủ</th><th scope="col">Tác giả</th><th scope="col">Giấy phép</th><th scope="col">Tệp gốc</th></tr></thead>
        <tbody>{credits.map((credit) => <tr key={credit.playerId} className="border-t border-slate-100 align-top"><th scope="row" className="py-2 pr-3 text-left font-semibold"><Link href={playerPath(credit.playerId)} className="hover:underline">{credit.name}</Link></th><td className="pr-3 break-words">{credit.author}</td>
          <td className="pr-3">{credit.licenseUrl ? <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{credit.licenseName}</a> : credit.licenseName}</td>
          <td><a href={credit.descriptionUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" aria-label={`Trang tệp ảnh của ${credit.name} trên Wikimedia Commons (mở thẻ mới)`}>Wikimedia Commons</a></td></tr>)}</tbody></table></div>}
  </SportsShell>;
}
