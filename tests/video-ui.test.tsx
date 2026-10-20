import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { MatchHighlight } from "../components/matches/match-highlight";
import { MatchDetailView } from "../components/matches/match-detail";
import { uiDetail } from "./fixtures/match-ui";
import { videoCandidate } from "./fixtures/videos";
import type { VerifiedHighlight } from "../types/video-provider";

function highlight(): VerifiedHighlight { const video = videoCandidate(); return { ...video, url: `https://www.youtube.com/watch?v=${video.externalId}`, checkedAt: video.publishedAt, videoType: "HIGHLIGHT" }; }
describe("Match highlight link UI", () => {
  it("renders the exact clean no-verified-video state", () => { const html = renderToStaticMarkup(<MatchHighlight />); expect(html).toContain("Chưa có highlight tiếng Việt từ kênh bản quyền."); expect(html).not.toContain("<iframe"); expect(html).not.toContain("<video"); });
  it("shows original title, channel, type, date and a safe YouTube watch link", () => {
    const html = renderToStaticMarkup(<MatchHighlight highlight={highlight()} />); const $ = load(html); const link = $("a");
    expect(link.attr("href")).toBe("https://www.youtube.com/watch?v=fixture0001"); expect(link.attr("target")).toBe("_blank"); expect(link.attr("rel")).toContain("noopener");
    expect(html).toContain(videoCandidate().title); expect(html).toContain("Fixture VN"); expect(html).toContain("04:00"); expect(html).toContain("17/10/2026"); expect(html).not.toContain("Football Morning Brief đối chiếu");
    expect(html).not.toContain("<img"); expect(html).not.toContain("<iframe"); expect(html).not.toContain("undefined");
  });
  it("labels international fallback honestly without translating titles", () => { const html = renderToStaticMarkup(<MatchHighlight highlight={{ ...highlight(), language: "en" }} />); expect(html).toContain("Ngôn ngữ quốc tế"); expect(html).toContain(videoCandidate().title); });
  it("adds the panel to finished matches only without changing match information", () => {
    const finished = renderToStaticMarkup(<MatchDetailView match={uiDetail()} highlight={highlight()} now={new Date()} />);
    expect(finished).toContain("Thông tin trận đấu"); expect(finished).toContain("Video trận đấu");
    const scheduled = renderToStaticMarkup(<MatchDetailView match={uiDetail({ status: "SCHEDULED" })} now={new Date()} />); expect(scheduled).not.toContain("Video trận YouTube");
  });
});

describe("embedded highlight player", () => {
  it("shows YouTube's thumbnail as a play button and loads no player until the viewer presses play", async () => {
    const { HighlightPlayer } = await import("../components/matches/highlight-player");
    const $ = load(renderToStaticMarkup(<HighlightPlayer videoId="2cDvQymAgaE" title="HIGHLIGHTS: TOTTENHAM - COVENTRY" url="https://www.youtube.com/watch?v=2cDvQymAgaE" embedAllowed thumbnailUrl="https://i.ytimg.com/vi/2cDvQymAgaE/hqdefault.jpg" />));
    expect($("button").attr("aria-label")).toBe("Phát video: HIGHLIGHTS: TOTTENHAM - COVENTRY");
    expect($("img").attr("src")).toBe("https://i.ytimg.com/vi/2cDvQymAgaE/hqdefault.jpg");
    expect($("iframe")).toHaveLength(0);
  });
  it("opens YouTube instead when the owner turned embedding off, and refuses a malformed video ID", async () => {
    const { HighlightPlayer } = await import("../components/matches/highlight-player");
    const $ = load(renderToStaticMarkup(<HighlightPlayer videoId="2cDvQymAgaE" title="T" url="https://www.youtube.com/watch?v=2cDvQymAgaE" embedAllowed={false} />));
    expect($("button")).toHaveLength(0); expect($("a").attr("href")).toBe("https://www.youtube.com/watch?v=2cDvQymAgaE"); expect($("a").attr("target")).toBe("_blank");
    expect(renderToStaticMarkup(<HighlightPlayer videoId="bad id<script>" title="T" url="https://www.youtube.com/watch?v=x" embedAllowed />)).toBe("");
  });
  it("puts the player in the match highlight block when the video ID is known", () => {
    const html = renderToStaticMarkup(<MatchHighlight highlight={{ ...highlight(), videoId: "fixture0001", embedAllowed: true, thumbnailUrl: "https://i.ytimg.com/vi/fixture0001/hqdefault.jpg" }} />);
    expect(html).toContain("Phát video:"); expect(html).toContain("Mở trên YouTube"); expect(html).not.toContain("<iframe");
  });
});

describe("match video gallery", () => {
  it("lists the highlight first and the match's other clips beside it, newest clip first as given", () => {
    const clip = (id: string, title: string) => ({ ...highlight(), url: `https://www.youtube.com/watch?v=${id}`, videoId: id, title, videoType: "OTHER" as const, embedAllowed: true });
    const $ = load(renderToStaticMarkup(<MatchHighlight highlight={{ ...highlight(), videoId: "fixture0001", embedAllowed: true }} related={[clip("fixture0002", "Saka sút xa"), clip("fixture0003", "Rice đánh đầu")]} />));
    expect($("h3").text()).toBe("Video về trận đấu (3)");
    expect($("li button").map((_, node) => $(node).attr("aria-label")).get()).toEqual([`Xem: ${videoCandidate().title}`, "Xem: Saka sút xa", "Xem: Rice đánh đầu"]);
    expect($("li button").first().attr("aria-current")).toBe("true");
    expect($("li").eq(1).text()).toContain("Clip");
  });
});
