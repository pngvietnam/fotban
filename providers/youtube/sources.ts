/** Human-reviewed publisher links. channelId was read from the channel page on reviewedAt and is
 * checked on every run: the public feed must report the same channel ID and the expected author.
 * These are finite VN LINK mappings, not a grant to redistribute broadcaster footage.
 * Registry command only inserts missing rows and never re-enables a revoked source.
 */
export const initialVideoSources = [
  { key: "vn-initial-premier-league", handle: "@FPTBongDaOfficial", channelId: "UC4LvrpNXujjbGOS4RDvr41g", feedAuthor: "FPT Bóng Đá", reviewedAt: "2026-10-17T00:00:00Z", name: "FPT Bóng Đá", league: "premier-league", review: "https://fpt.vn/tin-tuc/cach-xem-ngoai-hang-anh-tren-dien-thoai-13799.html", rights: "https://blog.fptplay.vn/fptplay-san-sang-cho-ngoai-hang-anh-2026-27" },
  { key: "vn-initial-la-liga", handle: "@SCTVTheThaoOfficial", channelId: "UCiWyQp2HgKX2-WQUq11V8FA", feedAuthor: "SCTV Thể Thao Official", reviewedAt: "2026-10-17T00:00:00Z", name: "SCTV Thể Thao Official", league: "la-liga", review: "https://sctv.com.vn/tin-tuc/the-thao/laliga-ea-sports-2026-27-bung-no-tro-lai-tren-sctv", rights: "https://sctv.com.vn/tin-tuc/the-thao/laliga-ea-sports-2026-27-bung-no-tro-lai-tren-sctv" },
  // Owner-designated on 2026-10-20; TV360 announced UEFA club competition rights for 2024/25–2026/27 in Vietnam.
  { key: "vn-initial-champions-league", handle: "@tv360vtt", channelId: "UCbxWTKqVmD_AMeOIcKFhQ3Q", feedAuthor: "TV360 Thể Thao", reviewedAt: "2026-10-20T00:00:00Z", name: "TV360 Thể Thao", league: "champions-league", review: "https://daibieunhandan.vn/thuong-thuc-tron-ven-3-mua-giai-cup-chau-au-va-74-tran-doc-quyen-c1-hay-nhat-moi-mua-chi-co-tren-tv360-10343985.html", rights: "https://daibieunhandan.vn/thuong-thuc-tron-ven-3-mua-giai-cup-chau-au-va-74-tran-doc-quyen-c1-hay-nhat-moi-mua-chi-co-tren-tv360-10343985.html" },
  // Owner-designated on 2026-10-20; VTVcab holds exclusive Ligue 1 rights in Vietnam from 2025/26 and posts Vietnamese-commentary highlights here.
  { key: "vn-initial-ligue-1", handle: "@OnChampionsLeague", channelId: "UCbdlxg0t8O7WGPrFsVcz6Gg", feedAuthor: "VTVcab - On Champions League", reviewedAt: "2026-10-20T00:00:00Z", name: "VTVcab - On Champions League", league: "ligue-1", review: "https://www.youtube.com/@OnChampionsLeague", rights: "https://english.vtv.vn/news/vtvcab-is-exclusive-broadcaster-of-ligue-1-in-vietnam-for-the-20252026-season-20250821160437149.htm" },
] as const;
export const registeredChannel = (handle: string) => initialVideoSources.find((entry) => entry.handle.toLowerCase() === handle.toLowerCase()) ?? null;
