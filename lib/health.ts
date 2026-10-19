import type { DatabaseStatus, HealthReport } from "../types/health";

export async function checkHealth(probe: (() => Promise<unknown>) | null, requestId: string) {
  let database: DatabaseStatus = "not_configured";
  if (probe) {
    try {
      await probe();
      database = "up";
    } catch {
      database = "unavailable";
    }
  }
  const body: HealthReport = { app: "up", database, requestId };
  return { body, status: database === "up" ? 200 : 503 };
}
