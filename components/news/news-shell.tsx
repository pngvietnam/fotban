import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";

export function NewsShell({ children, section = "news" }: { children: ReactNode; section?: "news" | "league" }) {
  return <SportsShell section={section}>{children}</SportsShell>;
}
