/** Human-reviewed publisher links; handles must additionally resolve through channels.list.
 * These are finite VN LINK mappings, not a grant to redistribute broadcaster footage.
 * Registry command only inserts missing rows and never re-enables a revoked source.
 */
export const initialVideoSources = [
  { key: "vn-initial-premier-league", handle: "@FPTBongDaOfficial", name: "FPT Bóng Đá", league: "premier-league", review: "https://fpt.vn/tin-tuc/cach-xem-ngoai-hang-anh-tren-dien-thoai-13799.html", rights: "https://blog.fptplay.vn/fptplay-san-sang-cho-ngoai-hang-anh-2026-27" },
  { key: "vn-initial-la-liga", handle: "@SCTVTheThaoOfficial", name: "SCTV Thể Thao Official", league: "la-liga", review: "https://sctv.com.vn/tin-tuc/the-thao/laliga-ea-sports-2026-27-bung-no-tro-lai-tren-sctv", rights: "https://sctv.com.vn/tin-tuc/the-thao/laliga-ea-sports-2026-27-bung-no-tro-lai-tren-sctv" },
] as const;
