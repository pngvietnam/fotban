import "server-only";
import { parseEnvironment } from "./config";

export const env = parseEnvironment(process.env);
