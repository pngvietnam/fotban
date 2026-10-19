import { z } from "zod";

export type AuthSettings = { AUTH_SECRET?: string; AUTH_GOOGLE_ID?: string; AUTH_GOOGLE_SECRET?: string; DATABASE_URL?: string; NEXT_PUBLIC_APP_URL: string };
export function authReadiness(settings: AuthSettings, mode: string | undefined) {
  if (!settings.AUTH_SECRET || settings.AUTH_SECRET.length < 32) return { ready: false, reason: "SECRET" } as const;
  if (!settings.DATABASE_URL) return { ready: false, reason: "DATABASE" } as const;
  if (!settings.AUTH_GOOGLE_ID || !settings.AUTH_GOOGLE_SECRET) return { ready: false, reason: "GOOGLE" } as const;
  if (mode === "production" && new URL(settings.NEXT_PUBLIC_APP_URL).protocol !== "https:") return { ready: false, reason: "HTTPS" } as const;
  return { ready: true, reason: null } as const;
}

// Only local application pages can be OAuth return destinations.
export function safeReturnPath(value: unknown, fallback = "/account") {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || /[\\\x00-\x20#]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://return.invalid");
    if (url.origin !== "https://return.invalid" || url.pathname.startsWith("/api/") || url.pathname === "/login" || /%2f|%5c|%0[ad]/i.test(value)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch { return fallback; }
}

export function sameOriginMutation(headers: Headers, appUrl: string) {
  return headers.get("origin") === new URL(appUrl).origin && headers.get("sec-fetch-site") !== "cross-site";
}
export const followTargetSchema = z.object({ type: z.enum(["CLUB", "PLAYER", "COMPETITION"]), entityId: z.uuid() }).strict();
export type FollowTarget = z.infer<typeof followTargetSchema>;
export const preferenceSchema = z.object({ locale: z.literal("vi-VN"), timezone: z.enum(["Asia/Ho_Chi_Minh", "Asia/Bangkok", "UTC"]) }).strict();
export class AccountError extends Error {
  constructor(public code: "LOGIN_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "UNAVAILABLE", public status: number) { super(code); }
}
export const accountErrorText = {
  LOGIN_REQUIRED: "Vui lòng đăng nhập để theo dõi.", INVALID_INPUT: "Thông tin chưa hợp lệ. Vui lòng thử lại.", NOT_FOUND: "Không tìm thấy mục theo dõi này.", UNAVAILABLE: "Tài khoản tạm thời chưa khả dụng. Vui lòng thử lại sau.",
};
