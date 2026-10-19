import type { AIInput } from "../../types/ai-provider";
import { aiResultSchema, type AIResult } from "./schema";
import { detectLanguage, hasMention, inputText, resolveEntities, uncertainty, vietnameseUncertainty } from "./rules";
import { AIError } from "./remote";
import { transferTalks } from "../../lib/transfer-claims";

const numbers = (text: string): string[] => text.match(/\d+(?:[.,:/-]\d+)*/g) ?? [];
export function validateAIResult(raw: unknown, input: AIInput): AIResult {
  const parsed = aiResultSchema.safeParse(raw);
  if (!parsed.success) throw new AIError("INVALID_OUTPUT");
  const output = parsed.data; const source = inputText(input);
  const fail = () => { throw new AIError("INVALID_OUTPUT"); };
  const detected = detectLanguage(source, input.language);
  if (detected !== "unknown" && output.language !== detected) fail();
  if (uncertainty.test(source) && output.certainty !== "UNCERTAIN") fail();
  if (Boolean(output.titleVi) !== Boolean(output.summaryVi)) fail();
  for (const field of ["titleVi", "summaryVi"] as const) {
    const value = output[field]; const evidence = output.evidence.filter((row) => row.field === field);
    if (!value) { if (evidence.length) fail(); continue; }
    if (evidence.length !== 1 || evidence[0].sourceText.length < 12 || !source.includes(evidence[0].sourceText)) fail();
    if (!/[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/iu.test(value) || /["“”«»‘’<>]|https?:\/\//iu.test(value) || /(?:^|\s)'[^'\n]+'/u.test(value)) fail();
    if (numbers(value).some((number) => !numbers(evidence[0].sourceText).includes(number))) fail();
    const allowedStarts = new Set(["Theo", "Câu", "Đội", "Tin", "Chấn", "Cầu", "Trận", "Huấn", "Chuyển", "Bóng", "Có", "Được", "Nguồn", "Thông", "Chưa", "Sau", "Trong", "Một", "Các"]);
    const properTokens = value.match(/(?<!\p{L})[A-Z][a-z]{2,}(?!\p{L})/gu) ?? [];
    if (properTokens.some((token) => !allowedStarts.has(token) && !hasMention(evidence[0].sourceText, token))) fail();
    if (uncertainty.test(source) && !vietnameseUncertainty.test(value)) fail();
    if (uncertainty.test(source) && /đã xác nhận|đã hoàn tất|chính thức gia nhập|đã ký hợp đồng/iu.test(value)) fail();
    // Known entities must be grounded in the exact evidence span, including aliases.
    for (const entity of input.entities) {
      if ([entity.name, ...entity.aliases].some((name) => hasMention(value, name)) && ![entity.name, ...entity.aliases].some((name) => hasMention(evidence[0].sourceText, name))) fail();
    }
    // High-risk facts require explicit corresponding source vocabulary, never inference.
    const hazards: [RegExp, RegExp][] = [
      [/chấn thương|rách cơ|gãy|chẩn đoán/iu, /injur|lesi[oó]n|chấn thương|fractur|torn|tear|diagnos/iu],
      [/ký hợp đồng|chính thức gia nhập|hoàn tất chuyển nhượng/iu, /signed|completed|officially joined|firm[oó]|ký hợp đồng|chính thức gia nhập/iu],
      [/tỷ số|bàn thắng|cú sút|kiểm soát bóng|xG/iu, /score|goal|shot|possession|gol|tỷ số|bàn thắng|xG/iu],
      [/tuyên bố|xác nhận/iu, /statement|confirmed|confirmado|tuyên bố|xác nhận/iu],
    ];
    if (hazards.some(([generated, required]) => generated.test(value) && !required.test(evidence[0].sourceText))) fail();
  }
  const resolved = resolveEntities(source, input.entities);
  if (output.entities.some((entity) => !resolved.some((item) => item.id === entity.id && item.kind === entity.kind && hasMention(source, entity.mention) && input.entities.some((candidate) => candidate.id === item.id && [candidate.name, ...candidate.aliases].some((alias) => alias.toLocaleLowerCase() === entity.mention.toLocaleLowerCase()))))) fail();
  if (output.mentions.some((mention) => !source.includes(mention.sourceText))) fail();
  if (output.transfer) {
    if (output.storyType !== "TRANSFER" || !source.includes(output.transfer.sourceText)) fail();
    // Authority assessment belongs to M7. An AI cannot grant it to itself.
    if (output.transfer.status === "CONFIRMED" || output.transfer.evidenceLevel === "AUTHORITATIVE") fail();
    if (uncertainty.test(source) && output.transfer.status !== "RUMOR" && output.transfer.status !== "INTEREST") fail();
    if (output.transfer.status === "NEGOTIATION" && !transferTalks.test(output.transfer.sourceText)) fail();
    if (output.transfer.status === "INTEREST" && !/interested|interest in|interés|quan tâm/iu.test(output.transfer.sourceText)) fail();
  }
  if (output.injury && output.storyType !== "INJURY") fail();
  const expectedReturn = output.injury?.expectedReturn;
  if (expectedReturn && uncertainty.test(expectedReturn.sourceText) && !uncertainty.test(expectedReturn.value)) fail();
  const extracted = [...(output.transfer ? [output.transfer.player, output.transfer.currentClub, output.transfer.targetClub] : []), ...(output.injury ? Object.values(output.injury) : [])];
  for (const field of extracted) {
    // Structured medical/transfer values are extractive in M6, never diagnosed/translated guesses.
    if (field && (!source.includes(field.sourceText) || !field.sourceText.includes(field.value))) fail();
  }
  if (output.publishable && (!output.titleVi || !output.summaryVi)) fail();
  return output;
}
