import { type MotionValue, useMotionValue } from "motion/react";
import { type RefObject, useLayoutEffect } from "react";
import type { MotionMode } from "./math.ts";

// How far a sideways track runs past the sheet's inner width, in pixels; 0 when it fits or in
// static mode. The gallery also stretches to the sheet's inner width, wider than the page's text
// column on large windows, so the cards use the whole sheet. Shared by the scenes that slide a row
// of cards sideways while the page scrolls down (#186).
export function useTrackOverflow(
  galleryRef: RefObject<HTMLDivElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
  mode: MotionMode,
): MotionValue<number> {
  const overflow = useMotionValue(0);

  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    const track = trackRef.current;
    // The sheet is the section's only child (Scene.tsx).
    const sheet = gallery?.closest("section")?.firstElementChild;
    if (mode !== "pinned" || !gallery || !track || !(sheet instanceof HTMLElement)) {
      overflow.set(0);
      return;
    }
    const measure = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(sheet);
      const inner =
        sheet.clientWidth - Number.parseFloat(paddingLeft) - Number.parseFloat(paddingRight);
      gallery.style.setProperty("--sheet-inner", `${inner}px`);
      overflow.set(Math.max(0, track.scrollWidth - inner));
    };
    // The sheet resizes with the window; the track when the fonts arrive.
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(track);
    return () => {
      observer.disconnect();
      gallery.style.removeProperty("--sheet-inner");
      overflow.set(0);
    };
  }, [galleryRef, trackRef, mode, overflow]);

  return overflow;
}
