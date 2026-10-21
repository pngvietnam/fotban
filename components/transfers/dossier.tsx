import Link from "next/link";
import type { Dossier } from "../../services/transfer-board-data";
import { boardStatusLabels, moneyVi, pressStatus, sameClub, transferTypeLabel } from "../../services/transfer-hub";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { playerPath } from "../../lib/player-presentation";
import { nationalityVi } from "../../lib/country-vi";
import { positionGroup } from "../../services/club-hub";
import { safeCrestUrl } from "../../lib/crest";
import { PlayerPhoto } from "../ui/player-photo";
import { Crest, Empty, StoryGrid } from "../domain/domain-ui";
import { statusClassFor } from "./market";

const dmy = (day: string | null) => day ? day.split("-").reverse().join("/") : null;
const ClubBlock = ({ label, name, crest }: { label: string; name: string | null; crest?: string | null }) => <div className="dossier-club"><small>{label}</small>{name ? <strong><Crest url={safeCrestUrl(crest)} name={name} />{name}</strong> : <strong>Chưa rõ</strong>}</div>;

/** One player's transfer dossier: what the provider has recorded, what the press is saying, and where it comes from. */
export function TransferDossier({ data, now }: { data: Dossier; now: Date }) {
  const { player, stories, clubCrests } = data;
  const groups = stories.kind === "ready" ? stories.data.groups.filter((group) => [group.lead, ...group.others].some((card) => card.storyType === "TRANSFER")) : [];
  const press = groups[0] ? pressStatus(groups[0].lead) : null;
  const mentioned = groups[0] ? [...new Map([groups[0].lead, ...groups[0].others].flatMap((card) => card.entities).filter((entity) => entity.kind === "club" && !sameClub(entity.name, player.club?.name)).map((entity) => [entity.name, entity])).values()] : [];
  const latest = player.transfers.find((item) => item.type !== "end of loan") ?? null;
  const hasProfile = Boolean(player.fetchedAt);
  const value = moneyVi(player.marketValue, player.marketValueCurrency);
  const facts: [string, string | null][] = [
    ["Giá trị thị trường", value ? `${value}${player.marketValueAt ? ` · ${dmy(player.marketValueAt)}` : ""}` : null],
    ["Hợp đồng đến", dmy(player.contractExpiry)], ["Gia nhập CLB hiện tại", dmy(player.joinedAt)],
    ["Chuyển nhượng gần nhất", latest ? `${transferTypeLabel(latest.type)} · ${latest.from ?? "?"} → ${latest.to ?? "?"} · ${dmy(latest.date)}${moneyVi(latest.fee, latest.currency) ? ` · ${moneyVi(latest.fee, latest.currency)}` : ""}` : null],
  ];
  const shownFacts = facts.filter((item): item is [string, string] => Boolean(item[1]));
  const injuries = player.injuries.filter((item) => item.from && Date.parse(item.from) > now.getTime() - 180 * 86400000).slice(0, 3);
  return <div className="domain-page transfer-dossier">
    <div className="dp-pagehead dossier-head">
      <div className="dossier-who"><PlayerPhoto photoUrl={player.photoUrl} size="lg" round /><div><span className="dp-kicker">HỒ SƠ CHUYỂN NHƯỢNG</span><h1>{player.name}</h1>
        <p className="dp-muted">{[positionGroup(player.position) === "Khác" ? null : positionGroup(player.position), nationalityVi(player.nationality)].filter(Boolean).join(" · ")}</p></div></div>
      {press && <span className={`transfer-status ${statusClassFor(press.status)}`}><i />{press.label} · theo báo chí</span>}
    </div>
    {press && <div className="dossier-note"><span className="fb-text fb-text-meta">Trạng thái theo cách báo chí đưa tin; Fotban chưa đối chiếu với thông báo chính thức của câu lạc bộ.</span></div>}
    <div className="dossier-route">
      <ClubBlock label="CLB HIỆN TẠI" name={player.club?.name ?? player.providerClub} crest={player.club?.crestUrl ?? (player.providerClub ? clubCrests[player.providerClub] : null)} />
      <span aria-hidden="true">→</span>
      {mentioned.length ? <div className="dossier-club"><small>CLB XUẤT HIỆN TRONG TIN</small><strong>{mentioned.map((club) => club.name).slice(0, 3).join(" · ")}</strong></div> : <ClubBlock label="CLB XUẤT HIỆN TRONG TIN" name={null} />}
    </div>
    <div className="dp-two-columns">
      <section className="dp-panel" aria-label="Điều được ghi nhận">
        <h2>Điều được ghi nhận</h2>
        {shownFacts.length ? <dl className="dp-facts">{shownFacts.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
          : <p className="dp-muted">Chưa có hồ sơ từ nhà cung cấp dữ liệu cho cầu thủ này; Fotban không điền phí hay hợp đồng khi chưa có số liệu.</p>}
        {player.rumours.length > 0 && <p className="dp-note">CLB được nhắc tới trong hồ sơ nhà cung cấp: {player.rumours.slice(0, 4).map((item) => `${item.club}${item.date ? ` (${dmy(item.date)})` : ""}`).join(", ")}. Đây là tin đồn, không phải xác nhận.</p>}
        {injuries.length > 0 && <p className="dp-note">Chấn thương gần đây: {injuries.map((item) => `${item.reason}${item.from ? ` từ ${dmy(item.from)}` : ""}${item.to ? ` đến ${dmy(item.to)}` : ""}`).join("; ")}.</p>}
      </section>
      <section className="dp-panel" aria-label="Nguồn và bằng chứng">
        <span className="dp-kicker">NGUỒN & BẰNG CHỨNG</span>
        {groups.length ? <><h2>Báo chí đưa tin</h2><ul className="dossier-sources">{groups.slice(0, 5).map((group) => <li key={group.key}><Link href={`/news/${group.lead.slug}`}>{group.lead.title}</Link><small>{group.lead.publisher} · <time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time>{group.others.length ? ` · +${group.others.length} báo` : ""}</small></li>)}</ul></>
          : <p className="dp-muted">Chưa có tin chuyển nhượng về cầu thủ này trong 7 ngày gần đây.</p>}
        <p className="dp-note">{hasProfile ? <>Hồ sơ (phí, giá trị, hợp đồng): <a href="https://highlightly.net" target="_blank" rel="noopener noreferrer">Highlightly</a>, cập nhật {newsAbsoluteTime(player.fetchedAt!)}. </> : null}Không suy luận độ chắc chắn từ số báo đưa tin.</p>
        <Link className="dp-secondary" href={playerPath(player.playerId)}>Mở hồ sơ cầu thủ →</Link>
      </section>
    </div>
    {player.transfers.length > 0 && <section className="dp-panel" aria-label="Lịch sử chuyển nhượng"><h2>Lịch sử chuyển nhượng</h2>
      {player.transfers.slice(0, 8).map((item, index) => <div className="dp-timeline" key={`${item.date}-${index}`}><span>{dmy(item.date)?.slice(3) ?? ""}</span><div><h3>{item.from ?? "?"} → {item.to ?? "?"}</h3><p>{transferTypeLabel(item.type)}{item.season ? ` · mùa ${item.season}` : ""}{moneyVi(item.fee, item.currency) ? ` · ${moneyVi(item.fee, item.currency)}` : item.feeText ? ` · ${item.feeText}` : ""}</p></div></div>)}
      <p className="dp-note">Theo hồ sơ của nhà cung cấp dữ liệu; {boardStatusLabels.recorded.toLowerCase()} không đồng nghĩa với thông báo chính thức của câu lạc bộ.</p>
    </section>}
    <h2 className="dp-extra-heading">Tin đúng cầu thủ này</h2>
    {groups.length || (stories.kind === "ready" && stories.data.groups.length) ? <StoryGrid result={stories} now={now} limit={6} /> : <Empty title="Chưa có tin về cầu thủ này" text="Chỉ hiện tin có nhắc đúng cầu thủ, không chèn tin của người khác." href="/news" label="Khám phá tin chung →" />}
  </div>;
}
