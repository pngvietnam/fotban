"use client";
import { useState } from "react";

const videoPattern = /^[A-Za-z0-9_-]{11}$/;
/**
 * YouTube's own embedded player, loaded only when the viewer presses play (privacy-enhanced
 * youtube-nocookie domain). The video stays on YouTube; nothing is downloaded or stored. When the
 * owner turned embedding off, the picture opens YouTube instead.
 */
export function HighlightPlayer({ videoId, title, url, embedAllowed, thumbnailUrl, badge, startPlaying = false }: {
  videoId: string; title: string; url: string; embedAllowed: boolean | null | undefined; thumbnailUrl?: string; badge?: string; startPlaying?: boolean;
}) {
  const [playing, setPlaying] = useState(startPlaying);
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
      ? <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setThumbFailed(true)} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
      : <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />}
    <span aria-hidden="true" className="absolute inset-0 bg-black/10 transition group-hover:bg-black/25" />
    {badge && <span aria-hidden="true" className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{badge}</span>}
    <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 pl-1 text-2xl text-slate-950 shadow-xl ring-4 ring-black/10 transition group-hover:scale-110 sm:h-[4.5rem] sm:w-[4.5rem]">▶</span>
  </>;
  const frame = "group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-900";
  return canEmbed
    ? <button type="button" onClick={() => setPlaying(true)} className={frame} aria-label={`Phát video: ${title}`}>{picture}</button>
    : <a href={url} target="_blank" rel="noopener noreferrer" className={frame} aria-label={`${title}: chủ kênh không cho phát ngoài YouTube, mở YouTube trong tab mới`}>{picture}</a>;
}

export type GalleryVideo = { videoId: string; url: string; title: string; embedAllowed: boolean | null | undefined; thumbnailUrl?: string; kind: string; meta: string };
/** The match highlight in a large player, with the match's other clips beside it; picking one plays it in the large player. */
export function HighlightGallery({ videos }: { videos: GalleryVideo[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(false);
  const current = videos[index];
  if (!current) return null;
  const others = videos.length > 1;
  return <div className={`mt-4 grid gap-5 ${others ? "lg:grid-cols-[minmax(0,1fr)_19rem]" : ""}`}>
    <div className="min-w-0">
      <HighlightPlayer key={current.videoId} videoId={current.videoId} title={current.title} url={current.url} embedAllowed={current.embedAllowed} thumbnailUrl={current.thumbnailUrl} badge={current.kind} startPlaying={picked} />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-bold leading-snug">{current.title}</p>
          <p className="mt-1 text-xs text-slate-500">{current.meta}</p>
        </div>
        <a href={current.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Mở trên YouTube <span aria-hidden="true">↗</span><span className="sr-only"> (tab mới)</span></a>
      </div>
    </div>
    {others && <div className="min-w-0">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Video về trận đấu ({videos.length})</h3>
      <ul className="-mx-1 max-h-[26rem] space-y-1 overflow-y-auto px-1">{videos.map((video, position) => <li key={video.videoId}>
        <button type="button" onClick={() => { setIndex(position); setPicked(true); }} aria-current={position === index ? "true" : undefined} aria-label={`Xem: ${video.title}`}
          className={`flex w-full items-start gap-3 rounded-lg p-1.5 text-left ${position === index ? "bg-slate-100" : "hover:bg-slate-50"}`}>
          <span aria-hidden="true" className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-slate-200">
            {video.thumbnailUrl
              // eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail for this clip
              ? <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              : null}
            {position === index && <span className="absolute inset-0 grid place-items-center bg-black/45 text-[10px] font-bold uppercase text-white">Đang xem</span>}
          </span>
          <span className="min-w-0"><span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900">{video.title}</span><span className="mt-1 block text-[11px] text-slate-600">{video.kind}</span></span>
        </button>
      </li>)}</ul>
    </div>}
  </div>;
}
