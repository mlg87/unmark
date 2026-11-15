import { type RefObject, useLayoutEffect } from "react";
import type { MotionMode } from "./math.ts";

// Scales a pinned track's cards down until the track fits the height its gallery has left under
// the scene's copy, through a --card-zoom custom property the stylesheet applies to each card.
// Without it, short laptop windows such as 1366 × 650 cut off the heading and the tallest card
// (#260). The stylesheet must stop the gallery at the room left rather than let it grow with the
// track. Static mode leaves the cards at full size.
export function useTrackFit(
  galleryRef: RefObject<HTMLDivElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
  mode: MotionMode,
): void {
  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    const track = trackRef.current;
    if (mode !== "pinned" || !gallery || !track) {
      return;
    }
    const measure = () => {
      // Read at full size, so the zoom never depends on the previous one: a zoom derived from a
      // zoomed height drifts by a rounded pixel each time and keeps the observer firing.
      gallery.style.removeProperty("--card-zoom");
      const natural = track.offsetHeight;
      const zoom = natural > 0 ? Math.min(1, gallery.clientHeight / natural) : 1;
      gallery.style.setProperty("--card-zoom", String(zoom));
    };
    // The gallery resizes with the window; the track when the fonts arrive.
    const observer = new ResizeObserver(measure);
    observer.observe(gallery);
    observer.observe(track);
    return () => {
      observer.disconnect();
      gallery.style.removeProperty("--card-zoom");
    };
  }, [galleryRef, trackRef, mode]);
}
