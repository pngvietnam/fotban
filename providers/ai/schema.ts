import { z } from "zod";

export const storyTypes = ["MATCH", "PLAYER", "CLUB", "TRANSFER", "INJURY", "MANAGER", "TACTICAL", "CONTRACT", "FINANCIAL", "OFF_FIELD", "INTERVIEW", "DISCIPLINE", "COMMUNITY", "OTHER"] as const;
const text = z.string().trim().min(1).max(1500);
const sourced = z.object({ value: text, sourceText: text }).strict();
export const aiResultSchema = z.object({
  language: z.enum(["en", "es", "vi", "unknown"]),
  titleVi: text.nullable(),
  summaryVi: text.nullable(),
  storyType: z.enum(storyTypes),
  subtype: z.enum(["BANTER", "MEME", "CONTROVERSY"]).nullable(),
  certainty: z.enum(["REPORTED", "UNCERTAIN"]),
  publishable: z.boolean(),
  warnings: z.array(z.enum(["TRANSLATION_REQUIRED", "THIN_CONTENT", "EDITORIAL_REVIEW", "PROVIDER_UNAVAILABLE", "UNKNOWN_LANGUAGE"])).max(10),
  entities: z.array(z.object({ id: z.uuid(), kind: z.enum(["club", "player", "league", "match"]), mention: text }).strict()).max(30),
  mentions: z.array(z.object({ kind: z.enum(["manager"]), sourceText: text }).strict()).max(10),
  evidence: z.array(z.object({ field: z.enum(["titleVi", "summaryVi"]), sourceText: text }).strict()).max(2),
  transfer: z.object({ status: z.enum(["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"]), evidenceLevel: z.enum(["SOURCE_REPORTED", "AUTHORITATIVE"]), sourceText: text, player: sourced.nullable(), currentClub: sourced.nullable(), targetClub: sourced.nullable() }).strict().nullable(),
  injury: z.object({ player: sourced.nullable(), description: sourced.nullable(), availability: sourced.nullable(), expectedReturn: sourced.nullable() }).strict().nullable(),
}).strict();
export type AIResult = z.infer<typeof aiResultSchema>;
export const versions = { prompt: "football-grounded-v1", schema: "ai-result-v1", output: "vi-editorial-v1" } as const;
