import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";

export function MatchShell({ children, back }: { children: ReactNode; back?: ReactNode }) {
  return <SportsShell section="matches" back={back}>{children}</SportsShell>;
}
