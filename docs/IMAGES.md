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

## Operation

```powershell
npm.cmd run players:images -- 1200 100   # up to 1200 players, 100 minutes; resumable, safe to rerun
```

Needs `WIKIMEDIA_USER_AGENT` with a real contact (Wikimedia policy). Requests are sequential (about 0.7 s apart) with `maxlag=5`; the first Wikimedia error stops the run and nothing is recorded for that player. Players without a result are processed first; not-found results are rechecked after 30 days and found ones after 90 days (licences can change). The news worker runs a time-boxed batch of 8 players per pass and pauses 30 minutes after a rate-limit response, so new squad members get photos without manual work.
