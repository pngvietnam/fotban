"use client";
import { useState } from "react";

const videoPattern = /^[A-Za-z0-9_-]{11}$/;
/**
 * YouTube's own embedded player, loaded only when the viewer presses play (privacy-enhanced
 * youtube-nocookie domain, no autoplay before that). The video stays on YouTube; nothing is
 * downloaded or stored. When the owner turned embedding off, the picture simply opens YouTube.
 */
export function HighlightPlayer({ videoId, title, url, embedAllowed, thumbnailUrl }: { videoId: string; title: string; url: string; embedAllowed: boolean | null | undefined; thumbnailUrl?: string }) {
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  if (!videoPattern.test(videoId)) return null;
  const canEmbed = embedAllowed !== false;
  if (playing && canEmbed) return <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
    <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`} title={title} className="absolute inset-0 h-full w-full"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
  </div>;
  const picture = <>
    {thumbnailUrl && !thumbFailed
      // eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail for this video, shown as the play button
      ? <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setThumbFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      : <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />}
    <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
    <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#c7f36b] text-2xl text-slate-950 shadow-lg transition group-hover:scale-110">▶</span>
    <span aria-hidden="true" className="absolute bottom-3 left-3 right-3 line-clamp-2 text-left text-sm font-bold leading-snug text-white drop-shadow">{title}</span>
  </>;
  const frame = "group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-900";
  return canEmbed
    ? <button type="button" onClick={() => setPlaying(true)} className={frame} aria-label={`Phát video: ${title}`}>{picture}</button>
    : <a href={url} target="_blank" rel="noopener noreferrer" className={frame} aria-label={`${title} — chủ kênh không cho phát ngoài YouTube, mở YouTube trong tab mới`}>{picture}</a>;
}
