import { load } from "cheerio";

/** A community discussion as a feed lists it: title and public counts only. Post text and user names are never read. */
export type FanItem = { source: "VOZ" | "REDDIT"; externalId: string; url: string; title: string; community: string; replies: number | null; lastActivityAt: string };

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const iso = (value: string | undefined) => { const time = Date.parse(value ?? ""); return Number.isFinite(time) ? new Date(time).toISOString() : null; };
/** Links stay on the community's own host, without tracking parameters. */
function cleanUrl(value: string | undefined, host: RegExp) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || !host.test(url.hostname) || url.username || url.password) return null;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}

/** The Voz forum RSS (XenForo): one item per thread, dated by its latest activity, with its reply count. */
export function parseVozRss(xml: string, community = "Voz · Thể dục thể thao"): FanItem[] {
  const $ = load(xml, { xmlMode: true });
  const items: FanItem[] = [];
  $("item").each((_, element) => {
    const item = $(element);
    const title = clean(item.children("title").text()); const url = cleanUrl(item.children("link").text(), /(^|\.)voz\.vn$/);
    const externalId = clean(item.children("guid").text()); const lastActivityAt = iso(item.children("pubDate").text());
    const comments = item.children().filter((__, child) => (child as { name?: string }).name === "slash:comments").first().text();
    if (!title || !url || !/^\d{1,12}$/.test(externalId) || !lastActivityAt) return;
    items.push({ source: "VOZ", externalId, url, title: title.slice(0, 240), community, replies: /^\d{1,9}$/.test(comments.trim()) ? Number(comments.trim()) : null, lastActivityAt });
  });
  return items;
}

/** A subreddit's Atom feed: one entry per post, with its link and last update. No author, no post text. */
export function parseRedditAtom(xml: string, community = "r/soccer"): FanItem[] {
  const $ = load(xml, { xmlMode: true });
  const items: FanItem[] = [];
  $("entry").each((_, element) => {
    const entry = $(element);
    const title = clean(entry.children("title").text()); const url = cleanUrl(entry.children("link").attr("href"), /(^|\.)reddit\.com$/);
    const externalId = clean(entry.children("id").text()).replace(/^t3_/, ""); const lastActivityAt = iso(entry.children("updated").text() || entry.children("published").text());
    if (!title || !url || !/^[a-z0-9]{3,12}$/i.test(externalId) || !lastActivityAt) return;
    items.push({ source: "REDDIT", externalId, url, title: title.slice(0, 240), community, replies: null, lastActivityAt });
  });
  return items;
}

/** Match threads are tagged by the community itself; long-running "official" club threads are club rooms; the rest are topics. */
export function fanKind(item: Pick<FanItem, "source" | "title">, clubCount: number): "MATCH" | "CLUB" | "TOPIC" {
  if (/\b(match thread|post[- ]match thread|pre[- ]match thread)\b/i.test(item.title)) return "MATCH";
  if (item.source === "VOZ" && /\bvs\.?\b|trực tiếp|trước trận|sau trận|thảo luận trận/i.test(item.title) && clubCount >= 2) return "MATCH";
  if (item.source === "VOZ" && clubCount === 1 && /official|20\d\d\s*[/-]\s*(20)?\d\d|mùa giải/i.test(item.title)) return "CLUB";
  return "TOPIC";
}
/** A Voz thread is football when it names a known club, player or league, or says so. */
export const footballWords = /bóng đá|ngoại hạng|champions league|c1\b|la liga|serie a|bundesliga|ligue 1|europa league|world cup|v[- ]?league|quả bóng vàng|ballon d.?or|premier league|đội tuyển|asian cup|euro 20\d\d|fifa|uefa|đá banh|cầu thủ|huấn luyện viên/i;
/** Titles with strong language or heavy topics stay off the site, whatever the community. */
export const crudeWords = /\b(đm|đ\.m|dm|đmm|cc|cl|vcl|vl|đéo|địt|đụ|cặc|lồn|buồi|ngu như|óc chó|súc vật)\b|\bfuck|\bshit\b|\bcunt\b|nigger|retard/iu;
/** Live score updates ("Como [4] - 0 Man United - Nico Paz 2'") and housekeeping threads are not fans talking: they repeat the match data. */
export const notTalk = /\[\d+\]\s*-\s*\d|\d\s*-\s*\[\d+\]|\b\d{1,3}\+?\d?'$|^daily discussion|^free talk|^weekly|^transfer (?:talk|discussion)|^\[mod\]|^reminder/i;
