export const newsErrorMessages = {
  DISABLED: "News source is disabled.", RIGHTS_REQUIRED: "Reviewed ingestion permission is required.",
  UNSUPPORTED: "No compatible adapter is configured for this source.", ROBOTS_DENIED: "Automated access is not permitted or robots policy is unavailable.",
  HTTP_ERROR: "News source returned an HTTP error.", BLOCKED: "News source blocks automated access.",
  RATE_LIMITED: "News source request limit reached; try after the recorded cooldown.",
  TIMEOUT: "News source request timed out.", NETWORK: "News source is temporarily unreachable.",
  MALFORMED: "News source response is malformed or its layout is unsupported.",
  TOO_LARGE: "News source response exceeds the configured size limit.",
  INVALID_ARTICLE: "Article metadata failed validation.", BUSY: "News source already has an active sync.",
  PERSISTENCE: "News data could not be saved.",
  MISSING_LICENSE: "Reusable content license metadata is missing.",
  UNSUPPORTED_LICENSE: "Content license or its scope is not supported for commercial reuse.",
  USER_AGENT_REQUIRED: "A descriptive WIKIMEDIA_USER_AGENT with real contact information is required.",
} as const;
export class NewsError extends Error {
  constructor(readonly code: keyof typeof newsErrorMessages, readonly retryAfterMs = 0) { super(newsErrorMessages[code]); this.name = "NewsError"; }
}
export function safeNewsError(error: unknown) { return error instanceof NewsError ? error : new NewsError("PERSISTENCE"); }
