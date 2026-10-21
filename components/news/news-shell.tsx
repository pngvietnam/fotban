import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";

export function NewsShell({ children, section = "news", back }: { children: ReactNode; section?: "news" | "league"; back?: ReactNode }) {
  return <SportsShell section={section} back={back}>{children}</SportsShell>;
}
