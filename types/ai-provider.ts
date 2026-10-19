export type EntityKind = "club" | "player" | "league" | "match";
export type EntityCandidate = { id: string; kind: EntityKind; name: string; aliases: string[] };
export type AIInput = {
  articleId: string;
  title: string;
  excerpt: string;
  language: string;
  sourceUrl: string;
  entities: EntityCandidate[];
};

/** Providers return untrusted data. Only the pipeline may validate and persist it. */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  process(input: AIInput, signal: AbortSignal): Promise<unknown>;
}

/** Extension contract for a future local runtime; no model or SDK is required. */
export interface LocalAIProvider extends AIProvider {
  readonly execution: "local";
}
