/** Player photos are Wikimedia Commons thumbnails shown by the reader's browser; FotBan never downloads or
 * stores them. Only Wikimedia's own hosts are accepted, whatever is stored in the database. */
export function safePhotoUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith("/wikipedia/commons/") ? url.href : null;
  } catch { return null; }
}
/** Free licences only: CC0, public domain, CC BY and CC BY-SA. Non-commercial and no-derivatives terms are refused. */
export function isFreeLicense(name: string | null | undefined) {
  const value = (name ?? "").trim();
  if (!value || /(^|[ -])(NC|ND)([ -]|$)|fair use|non-?free|GFDL only/i.test(value)) return false;
  return /^(CC0|CC0 1\.0|Public domain|PD[- ]|CC BY(?:-SA)?(?: \d(?:\.\d)?)?(?: [A-Za-z]{2,})?$)/i.test(value);
}
export const creditLine = (image: { author: string | null; licenseName: string | null }) => `${image.author ?? "Không rõ tác giả"} · Wikimedia Commons · ${image.licenseName ?? "giấy phép tự do"}`;
