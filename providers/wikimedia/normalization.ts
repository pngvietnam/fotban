import { load } from "cheerio";
import { z } from "zod";
import type { NewsSourceConfig, NormalizedArticle } from "../../types/news-provider";
import { parseReusableLicense } from "../../lib/news-licenses";
import { normalizedArticleSchema } from "../news/normalization";
import { NewsError } from "../news/errors";
import { wikinewsConfig } from "./config";

export const wikinewsPageSchema = z.object({ pageid: z.number().int().positive(), ns: z.literal(0), title: z.string().min(1), fullurl: z.url(), lastrevid: z.number().int().positive(), pagelanguage: z.literal("en"), categories: z.array(z.object({ title: z.string() })).max(100) });
export type WikinewsPage = z.infer<typeof wikinewsPageSchema>;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function wikinewsPublicationDate(categories: { title: string }[]) {
  const dates = categories.flatMap(({ title }) => {
    const match = /^Category:([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(title);
    if (!match || !months.includes(match[1])) return [];
    const key = `${match[3]}-${String(months.indexOf(match[1]) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    if (!z.iso.date().safeParse(key).success) return [];
    return [key];
  });
  if (dates.length !== 1) throw new NewsError("INVALID_ARTICLE");
  // Source publishes a day, not an exact instant. UTC midnight is explicitly documented date precision.
  return new Date(`${dates[0]}T00:00:00Z`);
}
export function verifyWikinewsPolicy(html: string, currentRights: { text: string; url: string }) {
  const rights = parseReusableLicense(currentRights.text, currentRights.url);
  if (rights.name !== "CC BY 4.0") throw new NewsError("UNSUPPORTED_LICENSE");
  const $ = load(html); const text = $.text().replace(/\s+/g, " ");
  const has = (suffix: string) => $('a[href]').toArray().some((node) => { try { const link = new URL($(node).attr("href")!, wikinewsConfig.policyUrl); return link.hostname === "creativecommons.org" && link.pathname === `/licenses/by/${suffix}/`; } catch { return false; } });
  // Fail closed if the published policy changes. No blanket site-license inference for older articles.
  if (!has("4.0") || !has("2.5") || !/after December 16, 2024/.test(text) || !/prior December 16, 2024 but after September 25, 2005/.test(text)) throw new NewsError("UNSUPPORTED_LICENSE");
  return rights;
}
export function normalizeWikinewsPage(page: WikinewsPage, html: string, source: NewsSourceConfig, evidenceUrl: string, collectedAt: Date): NormalizedArticle {
  const categoryNames = page.categories.map((category) => category.title);
  if (!categoryNames.includes("Category:Published") || categoryNames.some((name) => /^Category:(?:Disputed(?: articles)?|Articles (?:in dispute|disputed)|Copyright violations?|Retracted|Withdrawn)$/i.test(name))) throw new NewsError("INVALID_ARTICLE");
  const url = new URL(page.fullurl);
  if (url.origin !== "https://en.wikinews.org" || !url.pathname.startsWith("/wiki/") || url.search || url.hash || url.username || url.password) throw new NewsError("INVALID_ARTICLE");
  const publishedAt = wikinewsPublicationDate(page.categories);
  if (publishedAt.getTime() > collectedAt.getTime()) throw new NewsError("INVALID_ARTICLE");
  const day = publishedAt.toISOString().slice(0, 10);
  // Ambiguous transition dates and public-domain-era content are deliberately outside this adapter's allowlist.
  const license = day > "2024-12-16" ? parseReusableLicense("Creative Commons Attribution 4.0", "https://creativecommons.org/licenses/by/4.0/") : null;
  if (!license) throw new NewsError("UNSUPPORTED_LICENSE");
  const $ = load(html);
  if ($('[rel="license"],.copyright,.license,.licensetpl').length || /(?:all rights reserved|non-commercial|used (?:with|by) permission|fair[ -]use|copyright violation)/i.test($.text())) throw new NewsError("UNSUPPORTED_LICENSE");
  // Never take quoted/reproduced prose or embedded media. Conservative lead-only extraction.
  $("p").each((_, node) => { const paragraph = $(node); if (paragraph.find('q,blockquote,iframe,video,audio,[class*="quote"],[class*="copyright"],[data-mw]').length || /["“”„«»]/.test(paragraph.text())) paragraph.attr("data-reuse-excluded", "1"); });
  $("blockquote,q,figure,figcaption,img,video,audio,iframe,table,script,style,.thumb,.quotebox,.pullquote,.mw-references-wrap,sup").remove();
  const paragraphs = $(".mw-parser-output > p").length ? $(".mw-parser-output > p") : $("body > p");
  let excerptOriginal: string | null = null;
  for (const node of paragraphs.toArray()) {
    const paragraph = $(node);
    if (paragraph.find("#publishDate,.published,.date,blockquote,q").length || paragraph.attr("id") === "publishDate") continue;
    if (paragraph.attr("data-reuse-excluded")) break;
    const text = paragraph.text().replace(/\s+/g, " ").trim();
    // If the lead is quoted/marked or not ordinary prose, retain metadata only; never pick a later contextual paragraph.
    if (text.length < 60 || /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/.test(text)) continue;
    excerptOriginal = text.slice(0, source.maxExcerptChars) || null; break;
  }
  const revisionUrl = `https://en.wikinews.org/w/index.php?oldid=${page.lastrevid}`;
  const attribution = `“${page.title}” — Wikinews. ${url.href} Contributors/history: ${url.href}?action=history ; revision: ${revisionUrl}. ${license.name}: ${license.url} Text excerpt shortened and markup removed; quotations and media excluded.`;
  return normalizedArticleSchema.parse({ sourceName: source.name, sourceUrl: url.href, canonicalUrl: url.href, titleOriginal: page.title, excerptOriginal, language: "en", publishedAt, publishedAtPrecision: "DAY", collectedAt,
    license: { ...license, attribution, evidenceUrl, revisionUrl, verifiedAt: collectedAt } });
}
