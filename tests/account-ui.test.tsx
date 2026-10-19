import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { AccountView } from "../components/account/account-view";
import { FollowLink } from "../components/account/follow-link";
import { SportsShell } from "../components/sports-shell";
import { transferIds } from "./fixtures/transfer-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
describe("Vietnamese account and follow controls", () => {
  const account = () => renderToStaticMarkup(<AccountView user={{ id: "test-only", name: "Người đọc", email: "reader@example.test" }} follows={[{ type: "CLUB", entityId: transferIds.arsenal, name: "Arsenal", following: true }]} catalog={[{ type: "COMPETITION", entityId: transferIds.league, name: "Premier League", following: false }]} preferences={{ locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" }} search="" />);
  it("renders account identity, three follow groups and private preferences in Vietnamese", () => {
    const html = account(); const $ = load(html); expect($("h1").text()).toBe("Tài khoản & theo dõi");
    for (const text of ["Người đọc", "Câu lạc bộ bạn theo dõi", "Cầu thủ bạn theo dõi", "Giải đấu bạn theo dõi", "Đăng xuất", "Tiếng Việt", "Việt Nam (UTC+7)"]) expect(html).toContain(text);
    expect(html).not.toMatch(/>CLUB<|>PLAYER<|>COMPETITION<|undefined|null|<img/);
  });
  it("exposes follow state through keyboard buttons and accessible text", () => { const $ = load(account()); expect($("button[aria-pressed='true']").text()).toBe("Đang theo dõi"); expect($("button[aria-pressed='true']").attr("aria-label")).toBe("Bỏ theo dõi Arsenal"); expect($("[role='status']").length).toBeGreaterThan(0); expect($("input[type='search']").attr("id")).toBe("entity-search"); });
  it("public follow links preserve canonical IDs without loading sessions or client state", () => { const $ = load(renderToStaticMarkup(<FollowLink type="CLUB" entityId={transferIds.arsenal} name="Arsenal" />)); expect($("a").attr("href")).toContain(`entityId=${transferIds.arsenal}`); expect($("a").text()).toBe("Theo dõi Arsenal"); });
  it("public navigation remains open and merely links to the private account area", () => { const $ = load(renderToStaticMarkup(<SportsShell section="home"><h1>Thông tin công khai</h1></SportsShell>)); for (const path of ["/", "/matches", "/news", "/transfers", "/account"]) expect($(`a[href='${path}']`).length).toBeGreaterThan(0); expect($("h1").text()).toBe("Thông tin công khai"); });
});
