export type DatabaseStatus = "up" | "unavailable" | "not_configured";
export type HealthReport = {
  app: "up";
  database: DatabaseStatus;
  requestId: string;
};
