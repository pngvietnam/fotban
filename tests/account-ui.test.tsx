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
  const account = () => renderToStaticMarkup(<AccountView user={{ id: "test-only", name: "Người đọc", email: "reader@example.test" }} follows={[{ type: "CLUB", entityId: transferIds.arsenal, name: "Arsenal", following: true }, { type: "COMPETITION", entityId: transferIds.league, name: "Premier League", following: true }]} preferences={{ locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" }} />);
  it("renders account identity, followed groups and private preferences in Vietnamese", () => {
    const html = account(); const $ = load(html); expect($("h1").text()).toBe("Tài khoản & sở thích.");
    for (const text of ["Người đọc", "Giải đấu:", "Câu lạc bộ:", "Arsenal", "Đăng xuất", "Tiếng Việt", "Việt Nam (UTC+7)"]) expect(html).toContain(text);
    expect($("main a[href='/following/manage']").length).toBe(1);
    expect(html).not.toMatch(/>CLUB<|>PLAYER<|>COMPETITION<|undefined|null|<img/);
  });
  it("follow buttons are keyboard buttons that start unpressed until the viewer is known", () => {
    const $ = load(renderToStaticMarkup(<FollowLink type="CLUB" entityId={transferIds.arsenal} name="Arsenal" />));
    expect($("button").attr("aria-pressed")).toBe("false"); expect($("button").attr("aria-label")).toBe("Theo dõi Arsenal"); expect($("button").text()).toBe("Theo dõi Arsenal");
  });
  it("public navigation remains open and merely links to the private account area", () => { const $ = load(renderToStaticMarkup(<SportsShell section="home"><h1>Thông tin công khai</h1></SportsShell>)); for (const path of ["/", "/matches", "/news", "/transfers", "/following"]) expect($(`a[href='${path}']`).length).toBeGreaterThan(0); expect($("h1").text()).toBe("Thông tin công khai"); });
});
