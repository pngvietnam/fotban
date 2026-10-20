import { z } from "zod";
import { matchTimeZone } from "./match-presentation";

export const matchSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
/** "Thứ Ba, 20/10/2026" for headings. */
export function longDay(day: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${day}T12:00:00+07:00`));
}
