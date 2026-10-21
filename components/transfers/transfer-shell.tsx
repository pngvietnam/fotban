import type { ReactNode } from "react";
import { SportsShell } from "../sports-shell";
export function TransferShell({ children, back }: { children: ReactNode; back?: ReactNode }) { return <SportsShell section="transfers" back={back}>{children}</SportsShell>; }
