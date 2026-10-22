import type { FixtureRow } from "../types/league-hub";

/** RFC 5545 text escaping: backslash, semicolon, comma and line breaks. */
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines longer than 75 octets are folded with a leading space on the continuation. */
function fold(line: string) {
  if (Buffer.byteLength(line) <= 75) return line;
  const parts: string[] = []; let current = ""; let size = 0;
  for (const char of line) {
    const length = Buffer.byteLength(char);
    if (size + length > (parts.length ? 74 : 75)) { parts.push(current); current = ""; size = 0; }
    current += char; size += length;
  }
  parts.push(current);
  return parts.join("\r\n ");
}
const skipped = new Set(["POSTPONED", "CANCELLED", "SUSPENDED", "FINISHED"]);
/** A calendar file of a club's upcoming matches: kick-off in UTC, two hours long, one event per stored match. */
export function clubCalendar(clubName: string, fixtures: FixtureRow[], origin: string, now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fotban//Lich thi dau//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(`${clubName} · Fotban`)}`];
  for (const fixture of fixtures) {
    if (skipped.has(fixture.status)) continue;
    const start = new Date(fixture.kickoffAt); if (!Number.isFinite(start.getTime())) continue;
    lines.push("BEGIN:VEVENT", `UID:${fixture.slug}@fotban`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 2 * 3600000))}`,
      `SUMMARY:${escapeText(`${fixture.home.name} – ${fixture.away.name}`)}`, ...(fixture.competition ? [`DESCRIPTION:${escapeText(fixture.competition.name)}`] : []),
      `URL:${new URL(`/match/${encodeURIComponent(fixture.slug)}`, origin).href}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
