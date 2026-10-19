import { z } from "zod";
import { schedulerSettingsSchema } from "./scheduler-policy";

const optionalSecret = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const schema = z.object({
  DATABASE_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)).optional(),
  ),
  SPORTS_API_KEY: optionalSecret,
  FOOTBALL_DATA_API_KEY: optionalSecret,
  HIGHLIGHTLY_API_KEY: optionalSecret,
  NEWS_API_KEY: optionalSecret,
  WIKIMEDIA_USER_AGENT: z.preprocess((value) => value === "" ? undefined : value, z.string().max(300).regex(/^[\x20-\x7E]+$/).optional()),
  YOUTUBE_API_KEY: optionalSecret,
  AUTH_SECRET: optionalSecret,
  AUTH_GOOGLE_ID: optionalSecret,
  AUTH_GOOGLE_SECRET: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  AI_PROVIDER: z.preprocess((value) => value === "" ? undefined : value, z.enum(["fallback", "remote", "local"]).default("fallback")),
  AI_API_KEY: optionalSecret,
  AI_MODEL: optionalSecret,
  AI_ENDPOINT: z.preprocess((value) => value === "" ? undefined : value, z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }).optional()),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000").refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
}).extend(schedulerSettingsSchema.shape);

export function parseEnvironment(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Report field names only: validation errors must not echo credentials.
    throw new Error(`Invalid environment fields: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(", ")}`);
  }
  return result.data;
}
