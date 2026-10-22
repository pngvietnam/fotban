"use client";
import { useEffect, useState } from "react";

/** Time left to a kick-off, in days, hours and minutes; it ticks once a minute and says so when the match has begun. */
export function Countdown({ to, now }: { to: string; now: number }) {
  const [current, setCurrent] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => setCurrent(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const left = Date.parse(to) - current;
  if (!Number.isFinite(left)) return null;
  if (left <= 0) return <p className="cb-count cb-count-live" role="status">Trận đấu đã bắt đầu</p>;
  const days = Math.floor(left / 86_400_000); const hours = Math.floor((left % 86_400_000) / 3_600_000); const minutes = Math.floor((left % 3_600_000) / 60_000);
  const units: [number, string][] = [[days, "ngày"], [hours, "giờ"], [minutes, "phút"]];
  return <div className="cb-count" role="timer" aria-label={`Còn ${days} ngày ${hours} giờ ${minutes} phút`}>
    {units.map(([value, label]) => <span key={label} aria-hidden="true"><b>{String(value).padStart(2, "0")}</b><small>{label}</small></span>)}
  </div>;
}
