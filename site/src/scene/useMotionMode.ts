import { useLayoutEffect, useState } from "react";
import { type MotionMode, motionMode } from "./math.ts";

// The same query as the inline script in index.html, which picks the mode before first paint.
const WIDE = "(min-width: 900px)";
const NO_REDUCE = "(prefers-reduced-motion: no-preference)";

// Starts "static" so hydration matches the prerendered HTML, which never has the attribute, then
// takes the attribute the inline script set and follows the media queries from there (#183).
export function useMotionMode(): MotionMode {
  const [mode, setMode] = useState<MotionMode>("static");

  useLayoutEffect(() => {
    const root = document.documentElement;
    setMode(root.dataset.motion === "pinned" ? "pinned" : "static");

    const wide = matchMedia(WIDE);
    const noReduce = matchMedia(NO_REDUCE);
    const sync = () => {
      const next = motionMode({ wide: wide.matches, reduce: !noReduce.matches });
      if (next === "pinned") {
        root.dataset.motion = "pinned";
      } else {
        delete root.dataset.motion;
      }
      setMode(next);
    };
    wide.addEventListener("change", sync);
    noReduce.addEventListener("change", sync);
    return () => {
      wide.removeEventListener("change", sync);
      noReduce.removeEventListener("change", sync);
    };
  }, []);

  return mode;
}
