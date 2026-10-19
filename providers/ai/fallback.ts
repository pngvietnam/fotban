import type { AIInput, AIProvider } from "../../types/ai-provider";
import type { AIResult } from "./schema";
import { classify, detectLanguage, inputText, resolveEntities, uncertainty } from "./rules";

export class RuleBasedFallbackProvider implements AIProvider {
  readonly name = "RULE_BASED";
  readonly model = "extractive-v1";
  async process(input: AIInput): Promise<AIResult> {
    const text = inputText(input); const language = detectLanguage(text, input.language);
    // Copy only already-Vietnamese source text. This provider cannot translate.
    const safeVietnamese = language === "vi" && !/["“”«»‘’]/u.test(text) && !/(?:^|\s)'[^'\n]+'/u.test(text);
    return {
      language, titleVi: safeVietnamese ? input.title : null, summaryVi: safeVietnamese ? input.excerpt : null,
      storyType: classify(text), subtype: null, certainty: uncertainty.test(text) ? "UNCERTAIN" : "REPORTED", publishable: false,
      warnings: [safeVietnamese ? "EDITORIAL_REVIEW" : "TRANSLATION_REQUIRED"], entities: resolveEntities(text, input.entities), mentions: [],
      evidence: safeVietnamese ? [{ field: "titleVi", sourceText: input.title }, { field: "summaryVi", sourceText: input.excerpt }] : [],
      transfer: null, injury: null,
    };
  }
}
