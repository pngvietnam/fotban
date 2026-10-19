export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger");
    logger.info({ runtime: "nodejs" }, "app.started");
  }
}

export const onRequestError: import("next").Instrumentation.onRequestError = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger");
    logger.error({ requestId: crypto.randomUUID() }, "app.request_failed");
  }
};
