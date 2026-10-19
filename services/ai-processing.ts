import type { AIProvider } from "../types/ai-provider";
import { RuleBasedFallbackProvider } from "../providers/ai/fallback";
import { AIError, callProvider } from "../providers/ai/remote";
import { injection, inputText, resolveEntities } from "../providers/ai/rules";
import { validateAIResult } from "../providers/ai/validation";
import { AIProcessingStore, eligible, inputHash, makeInput } from "./ai-store";

type Options = { timeoutMs?: number; retryFailed?: boolean; identity?: string; logger?: { info(fields: Record<string, unknown>, message: string): void } };
export async function processArticle(id: string, store: AIProcessingStore, provider: AIProvider, options: Options = {}) {
  const article = await store.article(id);
  if (!article) return { status: "skipped", code: "NOT_FOUND" };
  const blocked = eligible(article);
  if (blocked) return { status: "skipped", code: blocked };
  const catalog = await store.catalog();
  const matched = resolveEntities(`${article.titleOriginal}\n${article.excerptOriginal}`, catalog);
  const input = makeInput(article, catalog.filter((entity) => matched.some((item) => item.id === entity.id && item.kind === entity.kind)));
  // Refuse instructions embedded in source text before invoking any provider.
  const suspicious = injection.test(inputText(input));
  const identity = options.identity ?? `${provider.name}:${provider.model}`;
  const hash = inputHash(article, input, identity);
  const run = await store.claim(id, hash, provider.name, provider.model, options.retryFailed ?? false, { input, requestedProvider: { name: provider.name, model: provider.model }, provenance: { sourceId: article.sourceId, sourceUrl: article.sourceUrl, publishedAt: article.publishedAt, language: article.language, licenseName: article.licenseName, licenseUrl: article.licenseUrl, attribution: article.attributionText, sourceRevisionUrl: article.sourceRevisionUrl, licenseEvidenceUrl: article.licenseEvidenceUrl } });
  if (!run) return { status: "cached", publishable: false };
  let actual = provider; let error: string | null = null; let output = null;
  try {
    const latest = await store.article(id);
    if (!latest || eligible(latest) || inputHash(latest, makeInput(latest, input.entities), identity) !== hash) throw new AIError("INVALID_OUTPUT");
    if (suspicious) throw new AIError("INVALID_OUTPUT");
    let raw: unknown;
    try { raw = await callProvider(provider, input, options.timeoutMs); }
    catch (failure) {
      // No automatic paid retry. Use an honest deterministic fallback and record its identity.
      error = failure instanceof AIError ? failure.code : "UNAVAILABLE";
      actual = new RuleBasedFallbackProvider(); raw = await callProvider(actual, input, options.timeoutMs);
    }
    output = validateAIResult(raw, input);
    if (error) output.warnings = [...new Set([...output.warnings, "PROVIDER_UNAVAILABLE" as const])];
  } catch (failure) { error = failure instanceof AIError ? failure.code : "UNAVAILABLE"; }
  const result = await store.finish(run, article, hash, input, identity, actual.name, actual.model, output, error);
  options.logger?.info({ event: "article_processing", articleId: id, runId: run.id, provider: actual.name, status: result.status, code: error }, "Article processing completed");
  return result;
}
