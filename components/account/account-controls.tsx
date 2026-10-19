"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FollowedEntity } from "../../services/following";

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";
export function LoginButton({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  return <div><button type="button" className={buttonClass} disabled={busy} onClick={async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/sign-in/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callbackURL: returnTo }) });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error();
      window.location.assign(data.url);
    } catch { setMessage("Không thể đăng nhập lúc này. Vui lòng thử lại."); setBusy(false); }
  }}>{busy ? "Đang chuyển đến Google…" : "Đăng nhập bằng Google"}</button><p role="status" className="mt-3 text-sm text-slate-600">{message}</p></div>;
}

export function FollowButton({ entity }: { entity: FollowedEntity }) {
  const [following, setFollowing] = useState(entity.following); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  return <div className="shrink-0"><button type="button" className={`${buttonClass} ${following ? "!bg-slate-100 !text-slate-800" : ""}`} aria-pressed={following} aria-label={`${following ? "Bỏ theo dõi" : "Theo dõi"} ${entity.name}`} disabled={busy} onClick={async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/following", { method: following ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: entity.type, entityId: entity.entityId }) });
      if (!response.ok) { setMessage(response.status === 401 ? "Phiên đã hết hạn. Vui lòng đăng nhập lại." : "Chưa thể cập nhật. Vui lòng thử lại."); return; }
      setFollowing(!following); setMessage(following ? "Đã bỏ theo dõi." : "Đã theo dõi."); router.refresh();
    } catch { setMessage("Chưa thể kết nối. Vui lòng thử lại."); } finally { setBusy(false); }
  }}>{busy ? "Đang lưu…" : following ? "Đang theo dõi" : "Theo dõi"}</button><p role="status" className="max-w-52 text-xs leading-5 text-slate-600">{message}</p></div>;
}

export function LogoutButton() {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  return <div><button type="button" className={buttonClass} disabled={busy} onClick={async () => {
    setBusy(true);
    try { const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!response.ok) throw new Error(); router.replace("/"); router.refresh(); }
    catch { setMessage("Chưa thể đăng xuất. Vui lòng thử lại."); setBusy(false); }
  }}>Đăng xuất</button><p role="status" className="mt-2 text-sm text-slate-600">{message}</p></div>;
}

export function PreferenceForm({ timezone }: { timezone: string }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="mt-4 flex flex-wrap items-end gap-4" onSubmit={async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try { const response = await fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: "vi-VN", timezone: form.get("timezone") }) }); setMessage(response.ok ? "Đã lưu tùy chọn." : response.status === 401 ? "Phiên đã hết hạn. Vui lòng đăng nhập lại." : "Chưa thể lưu tùy chọn."); }
    catch { setMessage("Chưa thể kết nối. Vui lòng thử lại."); } finally { setBusy(false); }
  }}><label className="text-sm font-medium">Múi giờ<select name="timezone" defaultValue={timezone} className="mt-2 block max-w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm"><option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option><option value="Asia/Bangkok">Bangkok (UTC+7)</option><option value="UTC">UTC</option></select></label><p className="text-sm text-slate-600">Ngôn ngữ: Tiếng Việt</p><button className={buttonClass} disabled={busy}>{busy ? "Đang lưu…" : "Lưu tùy chọn"}</button><p role="status" className="w-full text-sm text-slate-600">{message}</p></form>;
}
