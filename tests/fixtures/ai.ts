import type { AIInput, AIProvider } from "../../types/ai-provider";
import type { AIResult } from "../../providers/ai/schema";

export const articleId = "64d4aa54-04ad-4e13-8826-081de4fe9c9d";
export const clubId = "ac18d4a8-bd63-4c9e-9541-a1e5e6723394";
export const englishInput = (override: Partial<AIInput> = {}): AIInput => ({ articleId, title: "Man Utd reportedly considering a transfer", excerpt: "Manchester United may consider a transfer. The club could hold initial discussions.", language: "en", sourceUrl: "https://news.example.test/article", entities: [{ id: clubId, kind: "club", name: "Manchester United", aliases: ["Man Utd", "Man United"] }], ...override });
export function translated(input = englishInput(), override: Partial<AIResult> = {}): AIResult {
  return { language: "en", titleVi: "Man Utd được cho là đang cân nhắc chuyển nhượng", summaryVi: "Manchester United có thể cân nhắc chuyển nhượng và thảo luận ban đầu.", storyType: "TRANSFER", subtype: null, certainty: "UNCERTAIN", publishable: false, warnings: ["EDITORIAL_REVIEW"], entities: input.entities.map((entity) => ({ id: entity.id, kind: entity.kind, mention: entity.name })), mentions: [], evidence: [{ field: "titleVi", sourceText: input.title }, { field: "summaryVi", sourceText: input.excerpt }], transfer: { status: "RUMOR", evidenceLevel: "SOURCE_REPORTED", sourceText: input.excerpt, player: null, currentClub: null, targetClub: { value: "Manchester United", sourceText: input.excerpt } }, injury: null, ...override };
}
export function fakeAI(output: unknown | ((input: AIInput) => unknown) = (input: AIInput) => translated(input)): AIProvider {
  return { name: "TEST_ONLY", model: "deterministic-fixture-v1", process: async (input) => typeof output === "function" ? output(input) : output };
}
