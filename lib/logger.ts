import "server-only";
import { env } from "./env";
import { createLogger } from "./logging";

export const logger = createLogger(env.LOG_LEVEL);
