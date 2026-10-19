import type { AIInput, EntityCandidate } from "../../types/ai-provider";
import type { AIResult } from "./schema";

export const uncertainty = /\b(reportedly|may|could|understood to|believed to|interested in|considering|rumou?r|podría|podrían|podria|según|rumores|interés)\b|được cho|có thể|cân nhắc|quan tâm|tin đồn/iu;
export const vietnameseUncertainty = /được cho|có thể|cân nhắc|quan tâm|tin đồn|theo nguồn tin/iu;
export const injection = /ignore\s+(?:all\s+)?(?:previous|prior|system)|system\s*(?:prompt|message)|developer\s+message|<\|(?:system|assistant)|bỏ qua.*(?:chỉ dẫn|hướng dẫn)|ignora.*instrucciones|reveal.*(?:secret|key)|follow these instructions/iu;
const tokens = (value: string) => value.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const normalize = (value: string) => tokens(value).toLocaleLowerCase();
// Latin accents only (Barça → Barca, Mbappé → Mbappe); Vietnamese đ is a distinct letter and is kept.
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
// Upper-case codes (MU, ARS, CHE) are matched case-sensitively: lower-case "che"/"san" are ordinary
// Vietnamese words ("che chắn", "san bằng") and must not become Chelsea/Santander.
const isCode = (alias: string) => /^[A-Z][A-Z0-9]{1,3}$/.test(alias);
function needles(alias: string) {
  const trimmed = alias.trim();
  if (isCode(trimmed)) return { cased: true, values: [trimmed] };
  if (trimmed.length < 3) return { cased: false, values: [] };
  return { cased: false, values: [...new Set([normalize(trimmed), normalize(fold(trimmed))])] };
}
export function hasMention(text: string, alias: string) {
  const { cased, values } = needles(alias);
  const haystack = ` ${cased ? tokens(text) : normalize(text)} `;
  return values.some((value) => haystack.includes(` ${value} `));
}
function spans(text: string, alias: string) {
  const { cased, values } = needles(alias);
  const haystack = ` ${cased ? tokens(text) : normalize(text)} `;
  const found: [number, number][] = [];
  for (const value of values) for (let at = haystack.indexOf(` ${value} `); at >= 0; at = haystack.indexOf(` ${value} `, at + 1)) found.push([at, at + value.length + 1]);
  return found;
}
export function resolveEntities(text: string, catalog: EntityCandidate[]) {
  const matches = catalog.flatMap((entity) => [entity.name, ...entity.aliases].filter((name) => hasMention(text, name)).map((mention) => ({ entity, mention })));
  // An ambiguous alias never chooses one identity arbitrarily.
  const unambiguous = matches.filter((match) => !matches.some((other) => normalize(other.mention) === normalize(match.mention) && other.entity.id !== match.entity.id));
  // A short alias that only occurs inside a longer mention of another entity is not its own
  // mention: "Real" inside "Real Betis" is not Real Madrid. Lower-casing can change string
  // length for a few scripts; then positions are not comparable and no suppression is applied.
  const comparable = tokens(text).length === normalize(text).length;
  // A player's surname alias next to a different capitalised name belongs to someone else:
  // "Roy Keane" is not Michael Keane, and in "David Beckham" David is a given name, not Jonathan David.
  const cased = ` ${tokens(text)} `;
  const otherPerson = (entity: EntityCandidate, mention: string, [start, end]: [number, number]) => {
    const own = entity.name.split(/\s+/).map((part) => normalize(fold(part)));
    if (entity.kind !== "player" || /\s/.test(mention.trim()) || own.length < 2 || normalize(fold(mention)) !== own.at(-1)) return false;
    const foreignName = (word: string) => /^\p{Lu}\p{Ll}/u.test(word) && !own.includes(normalize(fold(word)));
    return foreignName(cased.slice(0, start).trimEnd().split(" ").at(-1) ?? "") || foreignName(cased.slice(end).trimStart().split(" ")[0] ?? "");
  };
  const located = unambiguous.map((match) => ({ ...match, spans: spans(text, match.mention).filter((span) => !comparable || !otherPerson(match.entity, match.mention, span)) }))
    .filter((match) => match.spans.length);
  const independent = located.filter((match) => !comparable || match.spans.some(([start, end]) => !located.some((other) =>
    other.entity.id !== match.entity.id && other.spans.some(([otherStart, otherEnd]) => otherStart <= start && end <= otherEnd && otherEnd - otherStart > end - start))));
  return independent
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
