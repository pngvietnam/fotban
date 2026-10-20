import { readMatchBySlug } from "./match-queries";
import { matchSlugSchema } from "../lib/match-filters";
import type { MatchDetail } from "../types/match-ui";

export type MatchDetailResult = { kind: "ready"; match: MatchDetail } | { kind: "not-found" } | { kind: "error" };

export async function loadMatchDetail(slug: string, read: () => Promise<MatchDetail | null>, onError?: () => void): Promise<MatchDetailResult> {
  if (!matchSlugSchema.safeParse(slug).success) return { kind: "not-found" };
  try {
    const match = await read();
    return match ? { kind: "ready", match } : { kind: "not-found" };
  } catch { onError?.(); return { kind: "error" }; }
}
export { readMatchBySlug };

