import { NewsError } from "../providers/news/errors";

// Deliberate narrow allowlist, not a guess based on a source's reputation/name.
export const reusableTextLicenses = {
  "https://creativecommons.org/licenses/by/4.0/": { name: "CC BY 4.0", evidenceName: /^(?:CC[ -]?BY|Creative Commons Attribution)[ -]?4\.0(?: International)?(?: License)?$/i },
  "https://creativecommons.org/licenses/by/2.5/": { name: "CC BY 2.5", evidenceName: /^(?:CC[ -]?BY|Creative Commons Attribution)[ -]?2\.5(?: Generic)?(?: License)?$/i },
} as const;
export function parseReusableLicense(name: unknown, url: unknown) {
  if (typeof name !== "string" || !name.trim() || typeof url !== "string" || !url.trim()) throw new NewsError("MISSING_LICENSE");
  let normalized: URL;
  try { normalized = new URL(url); } catch { throw new NewsError("UNSUPPORTED_LICENSE"); }
  if (!["https:", "http:"].includes(normalized.protocol) || normalized.username || normalized.password || normalized.port || normalized.search || normalized.hash) throw new NewsError("UNSUPPORTED_LICENSE");
  normalized.protocol = "https:";
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  const key = normalized.href as keyof typeof reusableTextLicenses;
  const license = reusableTextLicenses[key];
  if (!license || !license.evidenceName.test(name)) throw new NewsError("UNSUPPORTED_LICENSE");
  return { name: license.name, url: key, commercialReuseAllowed: true as const };
}
