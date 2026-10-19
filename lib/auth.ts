import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getDatabase } from "./db";
import { env } from "./env";
import { authReadiness } from "./auth-policy";
import { authenticationOptions } from "./auth-options";

let instance: ReturnType<typeof betterAuth> | undefined;
export function getAuth() {
  if (!authReadiness(env, process.env.NODE_ENV).ready) return null;
  const db = getDatabase();
  if (!db) return null;
  const options: BetterAuthOptions = {
    ...authenticationOptions(prismaAdapter(db, { provider: "postgresql", transaction: true }), env, async (userId) => {
      await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    }, process.env.NODE_ENV === "production"),
    plugins: [nextCookies()],
  };
  instance ??= betterAuth(options);
  return instance;
}

export async function activeUser(headers: Headers) {
  const session = await getAuth()?.api.getSession({ headers });
  return session?.user ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}
