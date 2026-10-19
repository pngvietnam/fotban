# Club crests and player photos

Owner decision (2026-10-19): club crests and player photos must be shown; letters are not an acceptable replacement.

## Club crests

- Source: the football-data.org crest link stored in `Club.externalCrestUrl` (all 40 current clubs).
- `components/ui/team-badge.tsx` shows the crest in the reader's browser. FotBan does not download, cache, proxy or rehost it; the request carries no referrer (`referrerPolicy="no-referrer"`).
- `lib/crest.ts` accepts only HTTPS `*.png`/`*.svg` files on `crests.football-data.org`, whatever is stored. Letters appear only when no usable crest exists or it fails to load.
- Rights: the provider's terms (section 9.2) state that crests are owned by their legal owners and that users must obtain consent from them. The owner accepted this risk. If a rights holder asks, remove its crest by setting `Club.externalCrestUrl` to null (or disable `TeamBadge`).
- Shown on standings, fixtures, club and player pages, card chips, match pages and the homepage match cards (looked up by club name because the Morning Brief stores names only).

## Player photos

No data provider supplies photos, so photos come from Wikimedia Commons under free licences.

- Matching (`services/player-images.ts`): a Wikidata search by name (also without accents), keeping only items that are human, an association football player (Q937857) and whose **birth date is identical** to the stored one. Zero or several matches means no photo: a wrong person is worse than none.
- Licence (`lib/player-photo.ts`): CC0, public domain, CC BY and CC BY-SA only. Non-commercial, no-derivatives, fair-use and non-free files are refused, and an author credit is required. The database enforces this (`PlayerImage_found_credit` CHECK).
- Display: the 320 px thumbnail is hotlinked from `upload.wikimedia.org`/`thumb.wikimedia.org` by the reader's browser (nothing is stored). The player page shows "Ảnh: author · Wikimedia Commons · licence" with links, and `/ghi-cong-anh` lists the credits of every photo shown; the site footer links to it.
- Players without a free photo show a neutral person outline (our own drawing), never letters.
- Coverage is partial by nature: about 59% of the first 83 players checked had a matching free photo.

## Publisher article images

Owner decision (2026-10-19): the publishers' feed images may be used on news cards.

- Source: the image the publisher itself puts in its RSS item (enclosure, `media:content`/`media:thumbnail`, or an `<img>` in the description). Article pages are never fetched to find a picture, so a publisher whose feed carries no image (currently Bongda.com.vn) simply has none.
- Only the address is stored (`ArticleFeedSnapshot.imageUrl`, HTTPS only by CHECK); FotBan never downloads, resizes or rehosts the file. The reader's browser loads it from the publisher's own server with no referrer, lazily, and the image disappears if it fails to load.
- Allowlist per publisher (`imageHosts` in `providers/news/vietnamese-sources.ts`): the publisher's site and image CDN only. Other hosts, tracking pixels, `http:`, credentials, ports and `data:` URLs are ignored when read and again when shown (the stored address is never trusted).
- Switch per source: `NewsSource.imagesAllowed` (off by default). `news:grant -- grant` turns it on with the grant; `news:grant -- images <slug|all> on|off --reviewer ... --reason ... --confirm` changes it alone (audited as `SOURCE_IMAGES_ON/OFF`); revoking a source turns it off. Turning it off hides that publisher's images at the next page load.
- Credit: each card shows "Ảnh: <publisher>" under the picture and the detail page says the image belongs to the publisher and is shown from its server. XML entities in signed image URLs (`&amp;`) are decoded before use; otherwise some CDNs (VnExpress) refuse the request.
- Size: a few CDNs have unsigned size rules that were checked by hand (`lib/news-image-size.ts`: Tuổi Trẻ `thumb_w/480` took an image from 1.2 MB to 255 KB, Dân trí `zoom/480_270` from 560 KB to 58 KB). Only the displayed address changes; the stored one is untouched and anything not matching a known pattern is used as served. VnExpress URLs are signed and cannot be resized, so those images stay at the publisher's size. All images are lazy-loaded.

## Operation

```powershell
npm.cmd run players:images -- 1200 100   # up to 1200 players, 100 minutes; resumable, safe to rerun
```

Needs `WIKIMEDIA_USER_AGENT` with a real contact (Wikimedia policy). Requests are sequential (about 0.7 s apart) with `maxlag=5`; the first Wikimedia error stops the run and nothing is recorded for that player. Players without a result are processed first; not-found results are rechecked after 30 days and found ones after 90 days (licences can change). The news worker runs a time-boxed batch of 8 players per pass and pauses 30 minutes after a rate-limit response, so new squad members get photos without manual work.
