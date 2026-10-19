/**
 * Smaller versions of publisher images for cards, only for CDNs whose size rule was checked by hand (the URL is
 * not signed). Other images, including VnExpress's signed ones, are used as the publisher serves them. The stored
 * address is never changed; anything that does not match a known pattern is returned unchanged.
 */
const rules: readonly { host: string; rewrite: (pathname: string) => string | null }[] = [
  // Tuoi Tre: /thumb_w/<width>/<path>
  { host: "tuoitre.vn", rewrite: (path) => /^\/thumb_w\/\d+\//.test(path) ? path.replace(/^\/thumb_w\/\d+\//, "/thumb_w/480/") : null },
  // Dan tri: /zoom/<w>_<h>/<path>, or the bare dated path
  { host: "dantri.com.vn", rewrite: (path) => /^\/zoom\/\d+_\d+\//.test(path) ? path.replace(/^\/zoom\/\d+_\d+\//, "/zoom/480_270/") : /^\/\d{4}\//.test(path) ? `/zoom/480_270${path}` : null },
  // Thanh Nien, VTV and Thethao247 already serve small images in their feeds; VnExpress URLs are signed.
];
export function cardImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const rule = rules.find((item) => host === item.host || host.endsWith(`.${item.host}`));
    const path = rule?.rewrite(url.pathname);
    if (!path) return value;
    url.pathname = path;
    return url.href;
  } catch { return null; }
}
