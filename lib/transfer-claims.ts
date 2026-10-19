// Deliberately conservative completion vocabulary, shared by processing/reliability/tracking.
export function completedTransfer(text: string) {
  return text.split(/[.!;\n]+/u).some((clause) => {
    if (/\?|\b(?:not|never|denied|denies|could|may|reportedly|rumou?r|autographs?|petition|sponsorship)\b|chưa|không|có thể|được cho là|podr[ií]a/iu.test(clause)) return false;
    return /\b(?:has|have) signed\b|\b(?:has|have) joined\b(?!\s+(?:talks|negotiations|discussions))|officially (?:signed|completed|joined)|announced (?:the )?(?:completed transfer|signing)|ha firmado|đã ký hợp đồng|chính thức (?:gia nhập|hoàn tất chuyển nhượng)/iu.test(clause);
  });
}
export const transferTalks = /\b(?:talks|negotiat\w*|negociaciones|submitted (?:an? |the )?bid|made (?:an? |the )?offer|advanced discussions)\b|đàm phán|thương lượng|gửi đề nghị|ra giá/iu;
export const transferInterest = /interested in|interest in|monitoring|shortlist|scouting|exploratory contact|quan tâm|theo dõi|interés/iu;
export const transferStopped = /talks (?:have )?(?:collapsed|ended)|bid (?:was |has been )?rejected|no longer interested|đàm phán (?:đổ vỡ|chấm dứt)|không còn quan tâm/iu;
