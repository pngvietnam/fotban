"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCrestUrl } from "../../lib/crest";
import type { CatalogItem } from "../../services/follow-catalog";
import { useFollows } from "./follow-store";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

function Row({ item, on, busy, onToggle }: { item: CatalogItem; on: boolean; busy: boolean; onToggle: () => void }) {
  const crest = safeCrestUrl(item.crestUrl);
  return <div className="dp-follow-row">
    <Link href={item.href}>{crest
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
      ? <img src={crest} alt="" loading="lazy" referrerPolicy="no-referrer" />
      : <span className="dp-follow-mark" aria-hidden="true">{item.type === "COMPETITION" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v3a4 4 0 0 0 4 4 M17 5h4v3a4 4 0 0 1-4 4 M12 14v7 M8 21h8" /></svg> : item.name.slice(0, 1)}</span>}<span>{item.name}{item.detail && <small>{item.detail}</small>}</span></Link>
    <button type="button" className={on ? "dp-secondary" : "dp-primary"} aria-pressed={on} aria-label={`Theo dõi ${item.name}`} disabled={busy} onClick={onToggle}>{on ? "Đang theo dõi ✓" : "+ Theo dõi"}</button>
  </div>;
}

/** Search box plus every club, league and found player with a real follow toggle; guests save to this browser, signed-in readers to the account. */
export function FollowManager({ items, search }: { items: CatalogItem[]; search: string }) {
  const router = useRouter();
  const { ready, signedIn, follows, isFollowing, toggle } = useFollows();
  const [query, setQuery] = useState(search);
  const [busy, setBusy] = useState<string | null>(null); const [message, setMessage] = useState("");
  const shown = items.filter((item) => item.type === "PLAYER" || !query.trim() || fold(item.name).includes(fold(query.trim())));
  const change = async (item: CatalogItem) => {
    setBusy(item.entityId); setMessage("");
    const ok = await toggle({ type: item.type, entityId: item.entityId, name: item.name, crestUrl: item.crestUrl }, router.refresh);
    if (!ok) setMessage(signedIn ? "Chưa thể cập nhật. Vui lòng thử lại." : "Đã đạt giới hạn 40 mục theo dõi cho khách; hãy bỏ bớt hoặc đăng nhập.");
    setBusy(null);
  };
  return <div className="dp-two-columns">
    <div className="dp-panel">
      <div className="dp-section-heading"><h2>Quản lý theo dõi</h2><span>{ready ? `${follows.length} mục` : ""}</span></div>
      <form action="/following/manage" role="search"><input className="dp-search" name="q" type="search" aria-label="Tìm CLB, giải đấu hoặc cầu thủ để theo dõi" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm CLB, giải đấu, cầu thủ…" maxLength={80} /></form>
      {query.trim() && query.trim() !== search && <p className="dp-muted"><Link href={`/following/manage?q=${encodeURIComponent(query.trim())}`}>Tìm cầu thủ “{query.trim()}” →</Link></p>}
      <p role="status" className="dp-muted">{message}</p>
      {shown.map((item) => <Row key={`${item.type}:${item.entityId}`} item={item} on={ready && isFollowing(item.type, item.entityId)} busy={!ready || busy === item.entityId} onToggle={() => void change(item)} />)}
      {!shown.length && <p className="dp-muted">Chưa tìm thấy mục phù hợp.</p>}
      {search && !items.some((item) => item.type === "PLAYER") && <p className="dp-muted">Chưa tìm thấy cầu thủ nào tên “{search}”.</p>}
    </div>
    <div>
      <div className="dp-panel"><h2>Đọc theo sở thích</h2><p className="dp-muted">{follows.length ? `Bạn đang theo dõi: ${follows.map((item) => item.name).join(", ")}.` : "Theo dõi đội bóng để bắt đầu cá nhân hóa không gian của bạn."}</p><Link className="dp-secondary" href="/following">Mở Bảng tin của tôi →</Link></div>
      {ready && (signedIn
        ? <div className="dp-panel"><h2>Tài khoản</h2><p className="dp-muted">Lựa chọn được lưu trong tài khoản và dùng trên mọi thiết bị.</p><Link className="dp-secondary" href="/account">Mở tài khoản →</Link></div>
        : <div className="dp-panel"><h2>Chế độ khách</h2><p className="dp-muted">Lựa chọn được lưu trên trình duyệt này. Đăng nhập để giữ chúng trên mọi thiết bị; những gì bạn đã chọn sẽ được chuyển vào tài khoản.</p><Link className="dp-primary" href="/login?returnTo=%2Ffollowing%2Fmanage">Đăng nhập →</Link></div>)}
    </div>
  </div>;
}
