export type ProviderErrorCode = "NOT_CONFIGURED" | "UNAUTHORIZED" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "UPSTREAM" | "INVALID_JSON" | "MALFORMED_RESPONSE" | "UNSUPPORTED" | "BUSY";

const messages: Record<ProviderErrorCode, string> = {
  NOT_CONFIGURED: "Match provider is not configured. Set FOOTBALL_DATA_API_KEY in the server environment.",
  UNAUTHORIZED: "Provider access denied. Check the configured key and competition entitlement locally.",
  RATE_LIMITED: "Provider request quota reached. Retry after the recorded cooldown.",
  TIMEOUT: "Provider request timed out.", NETWORK: "Provider network request failed.",
  UPSTREAM: "Provider is temporarily unavailable.", INVALID_JSON: "Provider returned invalid JSON.",
  MALFORMED_RESPONSE: "Provider response failed validation.", UNSUPPORTED: "Requested data is unavailable for this provider capability or competition.",
  BUSY: "A sync is already running for this resource.",
};

export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode, public readonly retryAfterMs?: number) {
    super(messages[code]);
    this.name = "ProviderError";
  }
}

export function safeProviderError(error: unknown) {
  return error instanceof ProviderError ? error : new ProviderError("UPSTREAM");
}
