"use client";
import { useEffect } from "react";

/** Every strip that scrolls sideways and should also be draggable with a mouse: the homepage rails, tab rows, filter chips, charts. */
export const dragScrollSelector = ".pitch-rail,.cinema-rail,.bite-rail,.hot-strip ul,.cb-bars,.dp-tabs,.lg-round-chips,.ov-leagues,.desk-filters,.social-leagues,.post-filters,.post-chips,.transfer-filter-list,.md-competition-tabs,.fan-drag";
const threshold = 5;

/**
 * Mouse drag to scroll for sideways strips (touch and trackpads already scroll them). One listener set for the whole page:
 * a press on a strip that overflows starts a drag after a few pixels, snapping is paused while it lasts, and the click that
 * ends a drag is swallowed so it does not open the card under the pointer.
 */
export function DragScroll() {
  useEffect(() => {
    let drag: { el: HTMLElement; startX: number; startLeft: number; moved: boolean } | null = null;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const el = target?.closest<HTMLElement>(dragScrollSelector);
      if (!el || el.scrollWidth <= el.clientWidth + 2 || target?.closest("input,select,textarea,label")) return;
      drag = { el, startX: event.clientX, startLeft: el.scrollLeft, moved: false };
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      const delta = event.clientX - drag.startX;
      if (!drag.moved) { if (Math.abs(delta) < threshold) return; drag.moved = true; drag.el.classList.add("is-dragging"); }
      drag.el.scrollLeft = drag.startLeft - delta;
    };
    const end = () => {
      if (!drag) return;
      const { el, moved } = drag; drag = null;
      el.classList.remove("is-dragging");
      if (moved) {
        const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, true), 100);
      }
    };
    // A dragged link or picture would otherwise start the browser's own drag-and-drop.
    const dragStart = (event: DragEvent) => { if (event.target instanceof Element && event.target.closest(dragScrollSelector)) event.preventDefault(); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("dragstart", dragStart);
    return () => {
      document.removeEventListener("pointerdown", down); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end); document.removeEventListener("dragstart", dragStart);
    };
  }, []);
  return null;
}
