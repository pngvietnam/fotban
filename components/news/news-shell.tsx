import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";

export function NewsShell({ children }: { children: ReactNode }) {
  return <SportsShell section="news">{children}</SportsShell>;
}
