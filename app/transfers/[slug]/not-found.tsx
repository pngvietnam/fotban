import { TransferShell } from "@/components/transfers/transfer-shell";
import { TransferState } from "@/components/transfers/transfer-state";
export default function NotFound() { return <TransferShell><h1 className="sr-only">Không tìm thấy thương vụ</h1><TransferState kind="missing" /></TransferShell>; }
