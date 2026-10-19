import { classify, uncertainty } from "../providers/ai/rules";

/**
 * Deterministic labels for attributed publisher RSS cards. These describe how a publisher
 * reported something; they never confirm it. A card is at most "Báo chí · Đang đưa tin".
 */
export type FeedLabel = "MEDIA" | "COMMUNITY";
export type FeedCertainty = "REPORTED" | "UNCONFIRMED";
export type FeedTransferStage = "INTEREST" | "NEGOTIATION" | "RUMOR";

export const feedCardWindowHours = 72;
export const feedLabel = (sourceTier: string | null | undefined): FeedLabel => sourceTier === "COMMUNITY" ? "COMMUNITY" : "MEDIA";

/** Cards matching these are held for an operator instead of being published automatically. */
export const sensitiveTerms: readonly { reason: string; pattern: RegExp }[] = [
  { reason: "DEATH", pattern: /tử vong|qua đời|thiệt mạng|tử nạn|đột tử|thi thể/iu },
  // Not plain "bị bắt": "bị bắt bài" (tactically figured out) is ordinary football language.
  { reason: "CRIME", pattern: /bắt giữ|bị cảnh sát bắt|bị công an bắt|khởi tố|truy tố|tạm giam|hình sự|xét xử|bản án|lừa đảo|cảnh sát điều tra|công an điều tra/iu },
  { reason: "SEXUAL", pattern: /tình dục|hiếp dâm|cưỡng hiếp|quấy rối|xâm hại|ấu dâm/iu },
  { reason: "DRUGS", pattern: /ma túy|doping|chất cấm/iu },
  // Not plain "kiện": it is part of "sự kiện" (event) and "điều kiện" (condition).
  { reason: "ACCUSATION", pattern: /cáo buộc|tố cáo|bê bối|khởi kiện|kiện tụng|đâm đơn kiện|bị kiện/iu },
  { reason: "DISCRIMINATION", pattern: /phân biệt chủng tộc|kỳ thị|xúc phạm chủng tộc/iu },
  { reason: "VIOLENCE", pattern: /bạo lực|hành hung|đâm chém|ẩu đả|tấn công cổ động viên/iu },
  { reason: "SELF_HARM", pattern: /tự tử|tự sát|trầm cảm/iu },
];
export const holdReasons = (text: string) => sensitiveTerms.filter(({ pattern }) => pattern.test(text)).map(({ reason }) => reason);

// Vietnamese hedging, interest and question headlines keep a card "Chưa xác nhận".
const vietnameseHedge = /tin đồn|được cho là|có thể|nhiều khả năng|rộ tin|đồn đoán|nghi vấn|cân nhắc|để mắt|nhắm tới|nhắm đến|theo dõi sát|quan tâm|hỏi mua|muốn chiêu mộ|muốn có|liên hệ|sẵn sàng chi|sẵn sàng bán|tiết lộ|\?\s*$/iu;
export const feedCertainty = (title: string, description: string | null): FeedCertainty =>
  [title, description ?? ""].some((text) => uncertainty.test(text) || vietnameseHedge.test(text)) ? "UNCONFIRMED" : "REPORTED";

const transferContext = /chuyển nhượng|chiêu mộ|mua đứt|cho mượn|hỏi mua|lời đề nghị|here we go|phí giải phóng|điều khoản giải phóng|bom tấn|thương vụ|gia nhập|tân binh/iu;
const negotiation = /đàm phán|đạt thỏa thuận|thỏa thuận cá nhân|lời đề nghị|gửi đề nghị|đề nghị|hỏi mua|ra giá|trả giá|chốt giá|kiểm tra y tế|here we go|đồng ý bán/iu;
const interest = /quan tâm|để mắt|theo dõi|nhắm tới|nhắm đến|muốn chiêu mộ|muốn có|liên hệ|danh sách mua sắm|săn đón|tiếp cận|nằm trong tầm ngắm/iu;
// Vietnamese headline types, checked in order before the generic (mostly English) classifier.
const vietnameseTypes: readonly [string, (title: string) => boolean][] = [
  ["TRANSFER", (title) => transferContext.test(title)],
  ["INJURY", (title) => /chấn thương|rách cơ|đứt dây chằng|gãy chân|nghỉ thi đấu|tin dữ/iu.test(title)],
  ["DISCIPLINE", (title) => /thẻ đỏ|treo giò|án phạt|kỷ luật|bị phạt|trọng tài|\bVAR\b/iu.test(title)],
  ["CONTRACT", (title) => /gia hạn|hợp đồng/iu.test(title)],
  ["INTERVIEW", (title) => /phỏng vấn|họp báo/iu.test(title) || (quoteLed.test(title) && !isMatchReport(title))],
  ["MANAGER", (title) => /\bHLV\b|huấn luyện viên|ghế nóng|sa thải|mất ghế|chiến lược gia/iu.test(title)],
  ["MATCH", (title) => isMatchReport(title) || /kết quả|bảng xếp hạng|lịch thi đấu|vòng \d+|đại chiến|derby|el clasico|siêu kinh điển|cú đúp|hat-trick|ghi bàn|kiến tạo|siêu phẩm|tuyệt phẩm/iu.test(title)],
  ["FINANCIAL", (title) => /doanh thu|tài chính|lợi nhuận|thua lỗ|giá trị thương hiệu/iu.test(title)],
  ["OFF_FIELD", (title) => /quả bóng vàng|giải thưởng|từ thiện|người hâm mộ|cổ động viên|tài trợ|lịch sử|kỷ lục/iu.test(title)],
];
export function feedStoryType(title: string, description: string | null) {
  return vietnameseTypes.find(([, test]) => test(title))?.[0] ?? classify(`${title}\n${description ?? ""}`);
}
/** Wording-only stage. A media report of a completed deal is still not CONFIRMED here. */
export function feedTransferStage(storyType: string, title: string, description: string | null): FeedTransferStage | null {
  if (storyType !== "TRANSFER") return null;
  const text = `${title}\n${description ?? ""}`;
  return negotiation.test(text) ? "NEGOTIATION" : interest.test(text) ? "INTEREST" : "RUMOR";
}
/** "CHÍNH THỨC:" style headlines are the publisher's wording, not verified official evidence. */
export const headlineClaimsOfficial = (title: string) => /chính thức|đã xác nhận|xác nhận/iu.test(title);

// International outlets that Vietnamese publishers commonly cite. Copies of one origin are one source.
const origins: readonly [string, RegExp][] = [
  ["Fabrizio Romano", /fabrizio romano|\bromano\b/iu], ["The Athletic", /the athletic/iu], ["Sky Sports", /sky sports?\b/iu],
  ["BBC", /\bbbc\b/iu], ["ESPN", /\bespn\b/iu], ["Marca", /\bmarca\b/iu], ["AS", /(?:tờ|báo|nhật báo) AS\b|\bdiario AS\b/u],
  ["Mundo Deportivo", /mundo deportivo/iu], ["Sport", /(?:tờ|báo) Sport\b/u], ["The Sun", /the sun\b/iu], ["Daily Mail", /daily mail/iu],
  ["Mirror", /\bmirror\b/iu], ["The Guardian", /\bguardian\b/iu], ["L'Équipe", /l['’]?[ée]quipe/iu], ["Relevo", /\brelevo\b/iu],
  ["The Telegraph", /telegraph/iu], ["Gazzetta dello Sport", /gazzetta/iu], ["Bild", /\bbild\b/iu], ["RMC Sport", /\brmc\b/iu],
];
export function originHint(title: string, description: string | null) {
  const text = `${title}\n${description ?? ""}`;
  const found = origins.map(([name, pattern]) => ({ name, at: text.search(pattern) })).filter((item) => item.at >= 0).sort((a, b) => a.at - b.at);
  return found[0]?.name ?? null;
}

/** A plain result report: has a result cue and is not an interview/quote, controversy or roundup angle. */
const resultCue = /\d+\s*[-–]\s*\d+|thắng|hòa|thua|đánh bại|đả bại|vượt ải|cầm hòa|chia điểm|đại thắng|gục ngã|ngược dòng|hạ gục|đè bẹp|đánh rơi|nhọc nhằn|bất phân thắng bại|nhấn chìm|vùi dập|thảm bại|mất điểm/iu;
// "Person: 'quote'" is an interview; "Leeds hòa MU 1-1: 'Quỷ đỏ' ..." is still a result report.
const quoteLed = /^([^:]{1,60}):\s*['"“‘]/u;
const otherAngle = /gây bão|chỉ trích|lên tiếng|tiết lộ|phát biểu|nói thẳng|chỉ thẳng|cảnh báo|chấm điểm|bảng xếp hạng|kết quả bóng đá|kết quả ngoại hạng|kết quả la liga|lịch thi đấu|kỷ lục|siêu phẩm|tuyệt phẩm|trọng tài|thẻ đỏ|VAR\b/iu;
export function isMatchReport(title: string) {
  const interview = quoteLed.exec(title);
  return resultCue.test(title) && !otherAngle.test(title) && !(interview && !resultCue.test(interview[1]));
}
