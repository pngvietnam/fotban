import { safeCrestUrl } from "../../lib/crest";
import { safePhotoUrl } from "../../lib/player-photo";

const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase() || "F";

/** A club crest or player photo, or the initials on a disc when none is stored. Styled by .fd-mark in domain.css. */
export function Mark({ url, name, size = "md", round = false, photo = false }: { url?: string | null; name: string; size?: "sm" | "md" | "lg"; round?: boolean; /** A player photo (Wikimedia) rather than a club crest. */ photo?: boolean }) {
  const safe = photo ? safePhotoUrl(url) : safeCrestUrl(url ?? null);
  const className = `fd-mark ${size}${round ? " round" : ""}`;
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest or free-licence photo
  return safe ? <img className={className} src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className={`${className} fd-mark-text`} aria-hidden="true">{initials(name)}</span>;
}
