import Link from "next/link";
import type { BoardRow, BoardStatus } from "../../services/transfer-hub";
import { boardStatusLabels } from "../../services/transfer-hub";
import { playerPath } from "../../lib/player-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { positionGroup } from "../../services/club-hub";
import { PlayerPhoto } from "../ui/player-photo";

export const boardFilters = [["tat-ca", "Tất cả"], ["da-ghi-nhan", "Đã ghi nhận"], ["dam-phan", "Đang đàm phán"], ["tin-don", "Tin đồn"]] as const;
export type BoardFilter = typeof boardFilters[number][0];
const statusOfFilter: Record<Exclude<BoardFilter, "tat-ca">, BoardStatus> = { "da-ghi-nhan": "recorded", "dam-phan": "talks", "tin-don": "rumor" };
export const parseBoardFilter = (value: string | string[] | undefined): BoardFilter | null => value === undefined ? "tat-ca" : typeof value === "string" && boardFilters.some(([key]) => key === value) ? value as BoardFilter : null;
export const transferPath = (playerId: string) => `/transfers/player-${playerId}`;
const statusClass = { recorded: "status-confirmed", talks: "status-talks", rumor: "status-rumor" } as const;
export const statusClassFor = (status: BoardStatus) => statusClass[status];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase();
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function ClubChip({ club }: { club: { name: string; crestUrl: string | null } | null }) {
  if (!club) return <span><span>Chưa rõ</span></span>;
  const crest = safeCrestUrl(club.crestUrl);
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  return <span>{crest && <img src={crest} alt="" loading="lazy" referrerPolicy="no-referrer" />}<span>{club.name}</span></span>;
}

/** The transfer board of prototype v2 on real data: player, from → to, fee (only from a record) and status as worded. */
export function TransferBoard({ rows, filter, show, now }: { rows: BoardRow[]; filter: BoardFilter; show: number; now: Date }) {
  void now;
  const counts = { "tat-ca": rows.length, "da-ghi-nhan": rows.filter((row) => row.status === "recorded").length, "dam-phan": rows.filter((row) => row.status === "talks").length, "tin-don": rows.filter((row) => row.status === "rumor").length };
  const shown = rows.filter((row) => filter === "tat-ca" || row.status === statusOfFilter[filter]);
  const visible = shown.slice(0, show);
  const href = (key: BoardFilter, all = false) => `/transfers${key === "tat-ca" && !all ? "" : `?${[key === "tat-ca" ? "" : `tt=${key}`, all ? "hien=tat-ca" : ""].filter(Boolean).join("&")}`}`;
  return <section className="transfer-center" aria-label="Chuyển động thị trường">
    <div className="transfer-board">
      <div className="transfer-board-heading"><span className="transfer-board-icon" aria-hidden="true">⇄</span><div><span>FOTBAN TRANSFER CENTER</span><h3>Mỗi thương vụ, một câu chuyện.</h3></div></div>
      <div className="transfer-toolbar"><nav className="transfer-filter-list" aria-label="Lọc theo trạng thái">{boardFilters.map(([key, label]) => <Link key={key} href={href(key)} aria-current={filter === key ? "true" : undefined} className={filter === key ? "active" : ""}><span>{label}</span><small>{counts[key]}</small></Link>)}</nav></div>
      <div className="transfer-column-head" aria-hidden="true"><span>Cầu thủ</span><span>CLB đi <b>→</b> CLB đến</span><span>Phí / giá trị</span><span>Trạng thái</span></div>
      <div className="transfer-list">
        {!visible.length && <div className="dp-empty" role="status"><span aria-hidden="true">f.</span><h3>Chưa có diễn biến phù hợp</h3><p>Chỉ hiện thương vụ có tin báo chí hoặc có trong hồ sơ chuyển nhượng của nhà cung cấp dữ liệu.</p></div>}
        {visible.map((row) => <article className="transfer-entry" key={row.key}><Link className="transfer-entry-main" href={transferPath(row.playerId)} aria-label={`${row.name}: ${row.statusLabel}`}>
          <span className="transfer-player">{row.photoUrl ? <PlayerPhoto photoUrl={row.photoUrl} size="md" round /> : <span className="transfer-player-avatar">{initials(row.name)}</span>}<span><b>{row.name}</b><small>{row.position && positionGroup(row.position) !== "Khác" ? positionGroup(row.position) : "Cầu thủ"}</small></span></span>
          <span className="transfer-clubs"><ClubChip club={row.from} /><b className="transfer-club-arrow" aria-hidden="true">→</b><ClubChip club={row.to} /></span>
          <span className="transfer-fee">{row.fee ? <><strong>{row.fee.text}</strong><small>{row.fee.kind === "recorded" ? "Theo hồ sơ chuyển nhượng" : "Giá trị thị trường · ước tính"}</small></> : <><strong>Chưa rõ</strong><small>Chưa có số liệu</small></>}</span>
          <span className="transfer-state"><span className={`transfer-status ${statusClass[row.status]}`}><i />{row.statusLabel}</span><small>{day(row.date)} <span>· Chi tiết</span></small></span>
        </Link></article>)}
      </div>
      <div className="transfer-board-footer"><span>Hiển thị {visible.length} / {shown.length} thương vụ</span>{shown.length > visible.length ? <Link href={href(filter, true)}>{`Xem thêm ${shown.length - visible.length} thương vụ ↓`}</Link> : show > 8 && shown.length > 8 ? <Link href={href(filter)}>Thu gọn danh sách ↑</Link> : <span />}</div>
    </div>
    <div className="transfer-legend"><span><i className="legend-confirmed" />Đã ghi nhận: có trong hồ sơ chuyển nhượng của nhà cung cấp dữ liệu</span><span><i className="legend-talks" />Đàm phán: báo chí đưa tin chưa hoàn tất</span><span><i className="legend-rumor" />Tin đồn: chưa kiểm chứng</span></div>
    <p className="transfer-disclaimer">Với tin đàm phán và tin đồn, CLB đi là CLB hiện tại của cầu thủ và CLB đến là CLB báo chí nhắc tới; trạng thái ghi theo cách báo đưa tin, Fotban chưa đối chiếu với thông báo chính thức. Phí chỉ hiện khi có trong hồ sơ chuyển nhượng; nếu không, ô này ghi giá trị thị trường ước tính. Dữ liệu hồ sơ: <a href="https://highlightly.net" target="_blank" rel="noopener noreferrer">Highlightly</a>. Đơn vị theo hồ sơ (thường là EUR).</p>
  </section>;
}

export { playerPath, boardStatusLabels };
