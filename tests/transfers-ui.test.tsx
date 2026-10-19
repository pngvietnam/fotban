import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { TransferCard, TransferTerms } from "../components/transfers/transfer-card";
import { TransferDetail } from "../components/transfers/transfer-detail";
import { TransferList } from "../components/transfers/transfer-list";
import { TransferFiltersView } from "../components/transfers/transfer-filters";
import { TransferShell } from "../components/transfers/transfer-shell";
import { TransferStatusBadge } from "../components/transfers/transfer-status";
import { parseTransferFilters, statusLabels, transferHref, transferMetadata } from "../lib/transfer-presentation";
import { completedTransfer } from "../lib/transfer-claims";
import { loadTransferDetail, loadTransfers } from "../services/transfer-query";
import { currentTransferSnapshot } from "../services/transfer-service";
import { transferStatusFor } from "../services/transfer-evidence";
import { ReliabilityEngine } from "../services/reliability-engine";
import { clusterFixture } from "./fixtures/clustering";
import { relNow, relInput, makeOfficial, changeText } from "./fixtures/reliability";
import { transferSnapshot, transferView } from "./fixtures/transfers";

const filters = { league: "all", status: "all", page: 1 } as const;
describe("transfer protections and Vietnamese UI", () => {
  it.each(["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"] as const)("renders %s with words, symbols and separate status styling", (status) => {
    const html = render(<TransferCard view={transferView(status)} now={relNow} />);
    expect(html).toContain(statusLabels[status]); expect(html).toContain("Player X"); expect(html).toContain("Origin"); expect(html).toContain("Arsenal");
    expect(html).not.toContain("<img"); expect(html).not.toContain("undefined");
    if (status !== "CONFIRMED") { expect(html).toContain("Chưa xác nhận hoàn tất"); expect(html).not.toContain("✓"); }
  });
  it("a confident AI/cached classification alone cannot grant confirmation", () => {
    const member = clusterFixture(1); member.reliability.transferStatus = "CONFIRMED"; member.reliability.label = "OFFICIAL"; member.reliability.certainty = "CONFIRMED"; member.reliability.explanation.independentSources = 999;
    expect(transferStatusFor(member)).toBe("RUMOR");
  });
  it("an official announcement of talks is not a completed signing", () => {
    expect(completedTransfer("Arsenal officially announced talks to sign Player X")).toBe(false);
    const input = makeOfficial(changeText(relInput(), "The club officially announced talks for a transfer", "The club officially announced talks for a transfer. The negotiations are ongoing.", "Câu lạc bộ công bố đàm phán chuyển nhượng", "Câu lạc bộ đang đàm phán chuyển nhượng.")); input.article.storyType = "TRANSFER";
    expect(new ReliabilityEngine().assess(input, relNow).transferStatus).toBe("NEGOTIATION");
    expect(completedTransfer("Arsenal has not signed Player X")).toBe(false);
    expect(completedTransfer("Arsenal has signed Player X")).toBe(true);
  });
  it("later rumor/counts never overwrite a confirmed snapshot", () => {
    const official = transferSnapshot("CONFIRMED", "2026-10-15T06:00:00Z"); const later = transferSnapshot("RUMOR", "2026-10-16T06:00:00Z");
    expect(currentTransferSnapshot([later, official])?.status).toBe("CONFIRMED");
  });
  it("preserves confirmed vs reported fee labels and never equates missing fee with free", () => {
    const facts = transferView().facts;
    facts.reportedFee = { value: "€40m including add-ons", currency: "EUR", evidenceId: "fixture", articleId: "fixture" };
    let html = render(<TransferTerms facts={facts} detailed />);
    expect(html).toContain("Phí được đưa tin"); expect(html).toContain("Chưa xác nhận chính thức"); expect(html).not.toContain("Phí được xác nhận");
    facts.confirmedFee = { ...facts.reportedFee, value: "€35m" }; html = render(<TransferTerms facts={facts} />);
    expect(html).toContain("Phí được xác nhận"); expect(html).toContain("€35m"); expect(html).toContain("EUR");
    html = render(<TransferTerms facts={transferView().facts} />); expect(html).toContain("Chưa có phí được dẫn nguồn"); expect(html).not.toContain("Miễn phí");
  });
  it("shows explicitly sourced contract/type without inventing dates", () => {
    const view = transferView(); view.facts.contractDuration = { value: "five-year contract", evidenceId: "fixture", articleId: "fixture" }; view.facts.transferType = { value: "LOAN", sourceText: "loan", evidenceId: "fixture", articleId: "fixture" };
    const html = render(<TransferDetail view={view} />); expect(html).toContain("five-year contract"); expect(html).toContain("Cho mượn"); expect(html).not.toContain("Hết hạn theo nguồn:");
  });
  it("does not invent hours for a source with day-only precision", () => {
    const view = transferView(); view.firstSeenDateOnly = true; view.lastUpdatedDateOnly = true; view.timeline[0].dateOnly = true; view.story.sources.forEach((source) => { source.dateOnly = true; });
    const html = render(<TransferDetail view={view} />);
    expect(load(html)("time").toArray().every((element) => !load(element).text().includes(":"))).toBe(true);
  });
  it("renders ordered evidence timeline, safe source links and original metadata", () => {
    const view = transferView("CONFIRMED"); view.timeline.unshift({ ...view.timeline[0], status: "INTEREST", publishedAt: "2026-10-14T06:00:00Z", headlineVi: "Arsenal đang quan tâm đến Player X" });
    const html = render(<TransferDetail view={view} />); const $ = load(html);
    expect($("section[aria-labelledby='transfer-timeline'] li").length).toBe(2);
    expect(html.indexOf("14/10/2026")).toBeLessThan(html.indexOf("17/10/2026"));
    expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"'); expect(html).toContain("Tiếng Anh"); expect(html).toContain("CC BY 4.0"); expect(html).toContain("Arsenal interested in Player X");
  });
  it("supports league and status filters, resets page and preserves the other filter", () => {
    const selected = { league: "la-liga", status: "RUMOR", page: 3 } as const; const html = render(<TransferFiltersView filters={selected} />); const $ = load(html);
    expect($('a[href="/transfers?league=la-liga&status=CONFIRMED"]').length).toBe(1); expect(html).not.toContain("page=3");
    expect(parseTransferFilters({ league: "premier-league", status: "NEGOTIATION" })).toEqual({ league: "premier-league", status: "NEGOTIATION", page: 1 });
    expect(parseTransferFilters({ status: "FAKE" })).toBeNull(); expect(parseTransferFilters({ league: ["premier-league", "la-liga"] })).toBeNull(); expect(parseTransferFilters({ page: "0" })).toBeNull();
    expect(transferHref(selected)).toBe("/transfers?league=la-liga&status=RUMOR&page=3");
  });
  it("renders honest incomplete mappings, no-confirmed and no-rumor states", () => {
    const view = transferView(); view.slug = null; view.story.transfer = { status: "INTEREST", player: null, currentClub: null, targetClub: null };
    const html = render(<TransferCard view={view} now={relNow} />);
    expect(html).toContain("Chưa ánh xạ cầu thủ"); expect(html).toContain("Chưa rõ đích đến"); expect(html).toContain(`/news/${view.story.slug}`); expect(html).not.toContain("null");
    for (const [status, text] of [["CONFIRMED", "Chưa có thương vụ được xác nhận"], ["RUMOR", "Chưa có tin đồn đang theo dõi"]] as const) expect(render(<TransferList filters={{ ...filters, status }} result={{ kind: "ready", transfers: [], nextPage: null }} now={relNow} />)).toContain(text);
  });
  it("handles query failures and invalid slugs without private errors or indexable metadata", async () => {
    const result = await loadTransfers(async () => { throw new Error("secret-driver-stack"); });
    const html = render(<TransferList filters={filters} result={result} now={relNow} />); expect(html).toContain('role="alert"'); expect(html).not.toContain("secret-driver-stack");
    const read = vi.fn(); expect(await loadTransferDetail("../invalid", read)).toEqual({ kind: "not-found" }); expect(read).not.toHaveBeenCalled();
    expect(transferMetadata(null, "https://brief.example.test")).toMatchObject({ robots: { index: false, follow: false } });
    expect(transferMetadata(transferView(), "https://brief.example.test").alternates?.canonical).toBe(`https://brief.example.test/transfers/${transferView().slug}`);
  });
  it("supports keyboard-safe mobile cards and wraps navigation and filters", () => {
    const html = render(<TransferShell><h1>Chuyển nhượng</h1><TransferList filters={filters} result={{ kind: "ready", transfers: [transferView()], nextPage: 2 }} now={relNow} /></TransferShell>);
    for (const item of ['href="#transfer-content"', 'id="transfer-content"', "min-w-0", "break-words", "md:grid-cols-2", "flex-wrap", 'aria-label="Trang chuyển nhượng"', "Theo dõi thương vụ"]) expect(html).toContain(item);
    expect(render(<TransferStatusBadge status="RUMOR" disputed />)).toContain("Thông tin mâu thuẫn");
  });
});
