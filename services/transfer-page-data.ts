import "server-only";
import { cache } from "react";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { TransferFilters } from "../types/transfers";
import { loadTransferDetail, loadTransfers, TransferQueryService } from "./transfer-query";
function service() { const db = getDatabase(); if (!db) throw new Error("Database unavailable"); return new TransferQueryService(prismaSyncDatabase(db)); }
export const readTransferList = (filters: TransferFilters) => loadTransfers(() => service().list(filters), () => logger.error({ requestId: crypto.randomUUID() }, "transfers.ui_list_failed"));
export const readTransferPage = cache((slug: string) => loadTransferDetail(slug, () => service().detail(slug), () => logger.error({ requestId: crypto.randomUUID() }, "transfers.ui_detail_failed")));
