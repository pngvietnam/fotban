import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";

export function MatchShell({ children }: { children: ReactNode }) {
  return <SportsShell section="matches">{children}</SportsShell>;
}
