"use client";
import { useRouter } from "next/navigation";
import { useFollows } from "../account/follow-store";
import { Mark } from "../ui/crest-mark";

export type QuickClub = { id: string; name: string; crestUrl: string | null };

/** One-tap follow for a reader with no team yet: the page refreshes with their follows, so the space below fills in at once. */
export function QuickFollow({ clubs }: { clubs: QuickClub[] }) {
  const router = useRouter();
  const { ready, isFollowing, toggle } = useFollows();
  return <ul className="qf-grid" aria-label="Chọn nhanh đội bóng bạn yêu thích">
    {clubs.map((club) => {
      const on = ready && isFollowing("CLUB", club.id);
      return <li key={club.id}><button type="button" aria-pressed={on} aria-label={`Theo dõi ${club.name}`} className={on ? "on" : ""} onClick={() => { void toggle({ type: "CLUB", entityId: club.id, name: club.name, crestUrl: club.crestUrl }, router.refresh); }}>
        <Mark url={club.crestUrl} name={club.name} size="md" /><span>{club.name}</span><i aria-hidden="true">{on ? "✓" : "+"}</i></button></li>;
    })}
  </ul>;
}
