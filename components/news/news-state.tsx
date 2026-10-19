import Link from "next/link";

const states = {
  empty: { title: "Chưa có tin được xuất bản", text: "Tin đang được xử lý và kiểm duyệt. Chỉ nội dung tiếng Việt có nguồn và quyền sử dụng phù hợp mới xuất hiện tại đây." },
  pending: { title: "Nội dung tiếng Việt chưa sẵn sàng", text: "Tin đang chờ xử lý hoặc kiểm duyệt. Vui lòng quay lại sau." },
  error: { title: "Chưa thể tải tin tức", text: "Dữ liệu tạm thời chưa khả dụng. Vui lòng thử lại sau." },
  invalid: { title: "Bộ lọc chưa hợp lệ", text: "Vui lòng chọn Premier League, La Liga hoặc tất cả tin." },
  missing: { title: "Không tìm thấy tin", text: "Tin không tồn tại hoặc chưa được phép xuất bản." },
};
export function NewsState({ kind }: { kind: keyof typeof states }) {
  const state = states[kind];
  return <div role={kind === "error" ? "alert" : "status"} className="my-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
    <span aria-hidden="true" className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-lg font-bold text-slate-500">FB.</span>
    <h2 className="text-xl font-bold">{state.title}</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600">{state.text}</p>
    <Link href="/news" className="mt-5 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">{kind === "error" ? "Thử tải lại" : "Xem tất cả tin"}</Link>
  </div>;
}
