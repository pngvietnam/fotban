"use client";
import type { ClubRow, LeagueSlug } from "../../types/league-hub";

/** Pick a club for the fixtures tab. A plain GET form, so it works without scripts; with them it submits on change. */
export function ClubPicker({ slug, clubs, selected }: { slug: LeagueSlug; clubs: ClubRow[]; selected: string | null }) {
  return <form className="lg-picker" action={`/league/${slug}`} method="get">
    <input type="hidden" name="tab" value="lich-thi-dau" /><input type="hidden" name="xem" value="doi" />
    <label htmlFor="lg-club">Đội</label>
    <select id="lg-club" name="doi" defaultValue={selected ?? ""} onChange={(event) => { if (event.currentTarget.value) event.currentTarget.form?.requestSubmit(); }}>
      <option value="" disabled>Chọn một đội…</option>
      {[...clubs].sort((a, b) => (a.shortName?.trim() || a.name).localeCompare(b.shortName?.trim() || b.name, "vi")).map((club) => <option key={club.clubId} value={club.clubId}>{club.shortName?.trim() || club.name}</option>)}
    </select>
    <noscript><button type="submit" className="dp-secondary">Xem</button></noscript>
  </form>;
}
