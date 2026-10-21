import Link from "next/link";
import type { StandingRow, StandingsData } from "../../types/league-hub";
import { clubPath } from "../../lib/club-presentation";
import { Crest } from "../domain/domain-ui";

/**
 * The Champions League knockout bracket since 2024/25, projected from the league-phase table. Seeded pairs
 * (1/2, 3/4 …) are split between the two halves by the draw, so each half shows "A or B" for every slot.
 *   Play-off: 9/10 v 23/24, 11/12 v 21/22, 13/14 v 19/20, 15/16 v 17/18
 *   Round of 16: 1/2 v (15–18 winner), 7/8 v (9/23 winner), 3/4 v (13/19 winner), 5/6 v (11/21 winner)
 *   Quarter-finals: (1/2 tie) v (7/8 tie), (3/4 tie) v (5/6 tie); the two meet in the semi-final.
 */
export const bracketPlan = [
  { seeds: [1, 2], playoff: [[15, 16], [17, 18]] },
  { seeds: [7, 8], playoff: [[9, 10], [23, 24]] },
  { seeds: [3, 4], playoff: [[13, 14], [19, 20]] },
  { seeds: [5, 6], playoff: [[11, 12], [21, 22]] },
] as const;

type Pair = readonly [number, number];
const name = (row: StandingRow) => row.shortName?.trim() || row.name;

/** `linked`: club links (the lists); the drawn tree is decorative and repeats them, so it stays out of the tab order. */
function Options({ pair, at, linked = true }: { pair: Pair; at: Map<number, StandingRow>; linked?: boolean }) {
  const rows = pair.map((position) => at.get(position)).filter((row): row is StandingRow => Boolean(row));
  return <span className="kb-options">{rows.map((row, index) => <span key={row.clubId} className="kb-team">
    {index > 0 && <small className="kb-or">hoặc</small>}
    {linked ? <Link href={clubPath(row.clubId)} title={`${row.name} (hạng ${row.position})`}><Crest url={row.crestUrl} name={row.name} /><span>{name(row)}</span><small>{row.position}</small></Link>
      : <span className="kb-static" title={`${row.name} (hạng ${row.position})`}><Crest url={row.crestUrl} name={row.name} /><span>{row.tla ?? name(row)}</span><small>{row.position}</small></span>}
  </span>)}</span>;
}
const Empty = ({ label }: { label: string }) => <div className="kb-box kb-empty" aria-label={label}><span>?</span><small>vs</small><span>?</span></div>;

function Half({ at, side }: { at: Map<number, StandingRow>; side: "left" | "right" }) {
  const columns = [
    <div className="kb-col po" key="po">{bracketPlan.map((slot) => <div key={slot.seeds.join()} className="kb-box"><Options pair={slot.playoff[0]} at={at} linked={false} /><small>vs</small><Options pair={slot.playoff[1]} at={at} linked={false} /></div>)}</div>,
    <div className="kb-col r16" key="r16">{[0, 2].map((first) => <div className="kb-pair" key={first}>{bracketPlan.slice(first, first + 2).map((slot) => <div key={slot.seeds.join()} className="kb-box"><span className="kb-winner">Thắng play-off</span><small>vs</small><Options pair={slot.seeds} at={at} linked={false} /></div>)}</div>)}</div>,
    <div className="kb-col qf" key="qf"><div className="kb-pair"><Empty label="Tứ kết" /><Empty label="Tứ kết" /></div></div>,
    <div className="kb-col sf" key="sf"><Empty label="Bán kết" /></div>,
  ];
  return <div className={`kb-half ${side}`}>{side === "left" ? columns : [...columns].reverse()}</div>;
}

/** The projected bracket (desktop: a tree; phones: the play-off and round-of-16 ties as lists). */
export function KnockoutBracket({ standings, currentRound, totalRounds }: { standings: StandingsData | undefined; currentRound: number | null; totalRounds: number }) {
  const rows = standings?.rows ?? [];
  if (rows.length < 24) return <section className="dp-panel"><h2>Loại trực tiếp</h2><p className="dp-muted">Sơ đồ sẽ có khi bảng xếp hạng vòng phân hạng đủ dữ liệu.</p></section>;
  const at = new Map(rows.map((row) => [row.position, row]));
  const done = currentRound !== null && currentRound >= totalRounds && rows.every((row) => (row.played ?? 0) >= totalRounds);
  return <section className="dp-panel lg-card kb" aria-labelledby="kb-title">
    <div className="lg-card-head"><h2 id="kb-title">Loại trực tiếp</h2><span>{done ? "Theo kết quả vòng phân hạng" : `Dự kiến theo BXH sau ${currentRound ? `lượt ${currentRound}/${totalRounds}` : "vòng phân hạng"}`}</span></div>
    <p className="dp-muted kb-note">Cặp hạt giống (1/2, 3/4…) được bốc thăm vào hai nửa nhánh nên mỗi ô ghi “hoặc”. Đội hạng 25–36 bị loại.</p>
    <div className="kb-tree" aria-hidden="true">
      <Half at={at} side="left" />
      <div className="kb-final"><svg className="kb-cup" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v3a4 4 0 0 0 4 4 M17 5h4v3a4 4 0 0 1-4 4 M12 14v7 M8 21h8" /></svg><small>Nhà vô địch</small><Empty label="Chung kết" /><b>Chung kết</b></div>
      <Half at={at} side="right" />
    </div>
    <div className="kb-lists">
      <h3>Play-off vòng loại trực tiếp</h3>
      <ul>{bracketPlan.map((slot) => <li key={slot.seeds.join()}><Options pair={slot.playoff[0]} at={at} /><small>vs</small><Options pair={slot.playoff[1]} at={at} /></li>)}</ul>
      <h3>Vòng 1/8</h3>
      <ul>{bracketPlan.map((slot) => <li key={slot.seeds.join()}><Options pair={slot.seeds} at={at} /><small>vs</small><span className="kb-winner">Đội thắng cặp hạng {slot.playoff[0].join("/")} – {slot.playoff[1].join("/")}</span></li>)}</ul>
      <p className="dp-muted">Tứ kết: nhánh hạt giống 1/2 gặp nhánh 7/8, nhánh 3/4 gặp nhánh 5/6; hai cặp này gặp nhau ở bán kết.</p>
    </div>
  </section>;
}
