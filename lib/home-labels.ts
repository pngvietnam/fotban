/** Homepage labels shared by the server blocks and the client strips (kept free of server and parsing dependencies). */

/** Drama tags of a played match, derived only from stored events and the final score. */
export type DramaTag = "comeback" | "late" | "hattrick" | "red" | "goalfest";
export const dramaLabels: Record<DramaTag, string> = { comeback: "Lội ngược dòng", late: "Bàn phút 90+", hattrick: "Hat-trick", red: "Thẻ đỏ", goalfest: "Mưa bàn thắng" };

/** "Dòng tin" filters: the story types the feed actually carries, in Vietnamese. */
export const updateTabs = [
  { key: "tat-ca", label: "Tất cả", types: null },
  { key: "tran-dau", label: "Trận đấu", types: ["MATCH"] },
  { key: "chuyen-nhuong", label: "Chuyển nhượng", types: ["TRANSFER", "CONTRACT"] },
  { key: "hlv", label: "Huấn luyện viên", types: ["MANAGER"] },
  { key: "phan-tich", label: "Phân tích", types: ["TACTICAL", "INTERVIEW"] },
] as const;
export type UpdateTab = typeof updateTabs[number]["key"];
export const parseUpdateTab = (value: string | string[] | undefined): UpdateTab => updateTabs.find((tab) => tab.key === value)?.key ?? "tat-ca";
