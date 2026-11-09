/**
 * Homepage dates in the way Vietnamese fans say them: "Hôm qua", "Tối nay 02:00", "CN 9/11".
 * Vietnam keeps UTC+7 all year, so the local calendar is a fixed shift (no time-zone database needed on the client).
 */
const hour = 3_600_000;
const day = 24 * hour;
const shift = 7 * hour;
const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

const local = (time: number) => new Date(time + shift);
/** Days since the epoch on the Vietnamese calendar. */
const calendarDay = (time: number) => Math.floor((time + shift) / day);
/** The "football night" a moment belongs to: kick-offs up to 06:00 still count as the evening before. */
const nightOf = (time: number) => Math.floor((time + shift - 6 * hour) / day);

/** "21:30" in Vietnamese time. */
export function vnClock(value: string | Date) {
  const date = local(new Date(value).getTime());
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}
/** "CN 9/11": weekday and day/month in Vietnamese time. */
export function vnShortDate(value: string | Date) {
  const date = local(new Date(value).getTime());
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
}

/**
 * When a match was or will be played, relative to now: a finished match is "Hôm nay", "Hôm qua" or "T7 8/11";
 * a coming one is "Tối nay 02:00" (a late-night kick-off belongs to tonight), "Hôm nay 18:30", "Ngày mai 21:00" or "CN 16/11 · 23:00".
 */
export function matchWhen(kickoffAt: string, now: Date, finished: boolean) {
  const time = Date.parse(kickoffAt); const today = calendarDay(now.getTime()); const date = calendarDay(time);
  if (finished) return date === today ? "Hôm nay" : date === today - 1 ? "Hôm qua" : vnShortDate(kickoffAt);
  const clock = vnClock(kickoffAt); const hourOfDay = local(time).getUTCHours();
  if (nightOf(time) === nightOf(now.getTime()) && (hourOfDay >= 18 || hourOfDay < 6)) return `Tối nay ${clock}`;
  if (date === today) return `Hôm nay ${clock}`;
  if (date === today + 1) return `Ngày mai ${clock}`;
  return `${vnShortDate(kickoffAt)} · ${clock}`;
}

/** True when the kick-off falls on today's football night or calendar day (a 02:00 kick-off belongs to the evening before). */
export function playedToday(kickoffAt: string, now: Date) {
  const time = Date.parse(kickoffAt);
  return nightOf(time) === nightOf(now.getTime()) || calendarDay(time) === calendarDay(now.getTime());
}
