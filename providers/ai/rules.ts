import type { AIInput, EntityCandidate } from "../../types/ai-provider";
import type { AIResult } from "./schema";

export const uncertainty = /\b(reportedly|may|could|understood to|believed to|interested in|considering|rumou?r|podría|podrían|podria|según|rumores|interés)\b|được cho|có thể|cân nhắc|quan tâm|tin đồn/iu;
export const vietnameseUncertainty = /được cho|có thể|cân nhắc|quan tâm|tin đồn|theo nguồn tin/iu;
export const injection = /ignore\s+(?:all\s+)?(?:previous|prior|system)|system\s*(?:prompt|message)|developer\s+message|<\|(?:system|assistant)|bỏ qua.*(?:chỉ dẫn|hướng dẫn)|ignora.*instrucciones|reveal.*(?:secret|key)|follow these instructions/iu;
const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function hasMention(text: string, alias: string) {
  return alias.trim().length >= 3 && ` ${normalize(text)} `.includes(` ${normalize(alias)} `);
}
export function resolveEntities(text: string, catalog: EntityCandidate[]) {
  const matches = catalog.flatMap((entity) => [entity.name, ...entity.aliases].filter((name) => hasMention(text, name)).map((mention) => ({ entity, mention })));
  // An ambiguous alias never chooses one identity arbitrarily.
  return matches.filter((match) => !matches.some((other) => normalize(other.mention) === normalize(match.mention) && other.entity.id !== match.entity.id))
    .filter((match, index, all) => all.findIndex((other) => other.entity.id === match.entity.id && other.entity.kind === match.entity.kind) === index)
    .map(({ entity, mention }) => ({ id: entity.id, kind: entity.kind, mention }));
}
export function detectLanguage(text: string, hint: string): AIResult["language"] {
  // A diacritic in a foreign player's name is not evidence of Vietnamese prose.
  if (/bóng đá|cầu thủ|câu lạc bộ|chuyển nhượng|đội bóng|chấn thương|huấn luyện viên|từ thiện|người hâm mộ|có thể/iu.test(text)) return "vi";
  if (/[¿¡ñ]|\b(?:el equipo|el jugador|fichaje|podría)\b/iu.test(text)) return "es";
  if (/\b(?:the|could|reportedly|club|player|match)\b/i.test(text)) return "en";
  return ["en", "es", "vi"].includes(hint) ? hint as "en" | "es" | "vi" : "unknown";
}
export function classify(text: string): AIResult["storyType"] {
  const patterns: [AIResult["storyType"], RegExp][] = [
    ["TRANSFER", /transfer|fichaje|chuyển nhượng|đang quan tâm|interested in/iu], ["INJURY", /injur|lesi[oó]n|chấn thương/iu],
    ["DISCIPLINE", /suspend|disciplin|án phạt/iu], ["CONTRACT", /contract|contrato|hợp đồng/iu], ["FINANCIAL", /revenue|financial|doanh thu/iu],
    ["INTERVIEW", /\binterview\b|entrevista|phỏng vấn/iu], ["TACTICAL", /\btactical\b|\bformation\b|chiến thuật/iu], ["MANAGER", /\bmanager\b|entrenador|huấn luyện viên/iu],
    ["OFF_FIELD", /charity|lifestyle|sponsor|celebration|từ thiện|tài trợ|parade/iu], ["COMMUNITY", /community|fans|supporters|cộng đồng/iu],
    ["MATCH", /\bkickoff\b|\bfixtures?\b|\bmatch(?:es)?\b|partido|trận đấu|tỷ số/iu],
  ];
  return patterns.find(([, expression]) => expression.test(text))?.[0] ?? "OTHER";
}
export const inputText = (input: AIInput) => `${input.title}\n${input.excerpt}`;
