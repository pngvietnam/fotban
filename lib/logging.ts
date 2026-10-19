import pino, { type DestinationStream } from "pino";

// Log only controlled event identifiers and explicitly allowlisted fields.
// Never serialize raw errors, request bodies, URLs, headers or provider payloads.
export function createLogger(level = "info", destination?: DestinationStream) {
  return pino({
    level,
    base: undefined,
    redact: {
      paths: ["AUTH_SECRET", "AUTH_GOOGLE_SECRET", "AUTH_GOOGLE_ID", "accessToken", "refreshToken", "idToken", "sessionToken", "cookie", "*.AUTH_SECRET", "*.AUTH_GOOGLE_SECRET", "*.accessToken", "*.refreshToken", "*.idToken", "*.sessionToken", "*.cookie", "password", "token", "secret", "authorization", "DATABASE_URL", "SPORTS_API_KEY", "FOOTBALL_DATA_API_KEY", "NEWS_API_KEY", "YOUTUBE_API_KEY", "OPENAI_API_KEY", "AI_API_KEY", "*.AI_API_KEY", "*.password", "*.token", "*.secret", "*.authorization", "req.headers.authorization", "req.headers.cookie", "headers.X-Auth-Token", "headers.x-auth-token", "headers.X-Goog-Api-Key", "headers.x-goog-api-key"],
      censor: "[REDACTED]",
    },
  }, destination);
}
