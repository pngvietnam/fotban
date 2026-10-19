import Link from "next/link";

export function MatchState({ kind }: { kind: "empty" | "error" | "invalid-filter" | "not-found" }) {
  const copy = {
    empty: { marker: "—", title: "Chưa có trận đấu trong khoảng ngày này", text: "Thử chọn ngày khác hoặc xem cả hai giải đấu.", link: "Đặt lại bộ lọc" },
    error: { marker: "!", title: "Chưa thể tải dữ liệu trận đấu", text: "Vui lòng thử lại sau. Dữ liệu đã lưu sẽ xuất hiện khi kết nối được khôi phục.", link: "Thử tải lại danh sách" },
    "invalid-filter": { marker: "?", title: "Bộ lọc chưa hợp lệ", text: "Chọn Premier League hoặc La Liga và một khoảng ngày hợp lệ, tối đa 32 ngày.", link: "Về danh sách trận đấu" },
    "not-found": { marker: "?", title: "Không tìm thấy trận đấu", text: "Đường dẫn có thể không còn đúng. Bạn có thể tìm trận đấu trong danh sách.", link: "Xem các trận đấu" },
  }[kind];
  return <section role={kind === "error" || kind === "invalid-filter" ? "alert" : "status"} className="my-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
    <span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-xl font-bold text-slate-500">{copy.marker}</span>
    <h2 className="mt-5 text-xl font-bold">{copy.title}</h2>
    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{copy.text}</p>
    <Link href="/matches" className="mt-6 inline-block rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">{copy.link}</Link>
  </section>;
}
