import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { safeCrestUrl } from "../lib/crest";
import { TeamBadge } from "../components/ui/team-badge";
import { MatchHero } from "../components/matches/match-hero";
import { uiDetail, uiNow } from "./fixtures/match-ui";

describe("club crests", () => {
  it("accepts only https provider crest files and rejects everything else", () => {
    expect(safeCrestUrl("https://crests.football-data.org/57.png")).toBe("https://crests.football-data.org/57.png");
    expect(safeCrestUrl("https://crests.football-data.org/86.svg")).toBe("https://crests.football-data.org/86.svg");
    for (const bad of [null, undefined, "", "not a url", "http://crests.football-data.org/57.png", "https://evil.example/57.png", "https://crests.football-data.org.evil.example/57.png",
      "https://user:pw@crests.football-data.org/57.png", "https://crests.football-data.org:8443/57.png", "https://crests.football-data.org/a/b.png", "https://crests.football-data.org/57.html", "javascript:alert(1)"]) expect(safeCrestUrl(bad)).toBeNull();
  });
  it("shows the crest, not letters, and loads it from the reader's browser without a referrer", () => {
    const $ = load(render(<TeamBadge name="Arsenal FC" tla="ARS" crestUrl="https://crests.football-data.org/57.png" />));
    expect($("img").attr("src")).toBe("https://crests.football-data.org/57.png"); expect($("img").attr("referrerpolicy")).toBe("no-referrer"); expect($("img").attr("loading")).toBe("lazy");
    expect($.text()).not.toContain("ARS"); expect($("span").first().attr("aria-hidden")).toBe("true");
  });
  it("falls back to letters only when there is no usable crest", () => {
    expect(load(render(<TeamBadge name="Arsenal FC" tla="ARS" crestUrl={null} />)).text()).toBe("ARS");
    const unsafe = load(render(<TeamBadge name="Arsenal FC" tla="ARS" crestUrl="https://evil.example/x.png" />));
    expect(unsafe("img")).toHaveLength(0); expect(unsafe.text()).toBe("ARS");
  });
  it("uses the crest on match teams", () => {
    const $ = load(render(<MatchHero now={uiNow} venueName={null} match={uiDetail({ homeClub: { name: "Arsenal FC", shortName: "Arsenal", tla: "ARS", externalCrestUrl: "https://crests.football-data.org/57.png" }, awayClub: { name: "Chelsea FC", tla: "CHE", externalCrestUrl: "https://evil.example/x.png" } })} />));
    expect($("img")).toHaveLength(1); expect($("img").attr("src")).toContain("57.png"); expect($("b").first().text()).toBe("Arsenal"); expect($(".mh-mono").text()).toBe("CHE");
  });
});
