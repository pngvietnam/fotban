import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";
export function TransferShell({ children }: { children: ReactNode }) { return <SportsShell section="transfers">{children}</SportsShell>; }
