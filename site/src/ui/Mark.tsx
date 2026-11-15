import { type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import { type Ref, useLayoutEffect } from "react";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import styles from "./Mark.module.css";

// Written by scripts/optimize-images.mjs from Artwork/mark-3d/ (#195).
const FILES = import.meta.glob<string>("../assets/generated/mark-*.{avif,webp,png}", {
  eager: true,
  import: "default",
});

const WIDTHS = [480, 960];
// The renders are square.
const SIDE = 960;

export type MarkAngle = "front-left" | "front" | "top";

function file(name: string): string {
  const url = FILES[`../assets/generated/${name}`];
  if (!url) {
    throw new Error(`No generated image ${name}; run scripts/optimize-images.mjs`);
  }
  return url;
}

function srcSet(angle: MarkAngle, format: "avif" | "webp"): string {
  return WIDTHS.map((width) => `${file(`mark-${angle}-${width}.${format}`)} ${width}w`).join(", ");
}

interface MarkProps {
  angle: MarkAngle;
  // Places the mark in its sheet and sets `--mark-width`, its width while pinned.
  className?: string;
  // The rendered width, for `sizes`; the same expression as the class's `--mark-width`.
  sizes: string;
  // Degrees.
  rotate: MotionValue<number>;
  // A CSS length.
  y: MotionValue<string>;
  // The hero's mark is on screen at load, so it skips lazy loading.
  priority?: boolean;
  ref?: Ref<HTMLElement>;
}

// A mark that turns from `from` to `to` degrees and drifts `driftVh` down (negative rises) while its
// sheet slides in and then through the sheet's own screens. Static mode holds the start pose: Motion
// leaves whatever it last wrote when a style goes away, so the styles stay attached (#202).
export function useMarkScroll(
  from: number,
  to: number,
  driftVh: number,
): { rotate: MotionValue<number>; y: MotionValue<string> } {
  const mode = useMotionMode();
  const { enter, progress } = useScene();
  const pinned = useMotionValue(0);
  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);
  const t = useTransform(
    [pinned, enter, progress],
    ([isPinned = 0, entered = 1, p = 1]: number[]) => (isPinned * (entered + p)) / 2,
  );
  const rotate = useTransform(t, [0, 1], [from, to]);
  const y = useTransform(t, (value) => `${driftVh * value}vh`);
  return { rotate, y };
}

// The 3D # mark, the poster graphic that recurs down the page (#195). Pure decoration: hidden from
// screen readers, and it never takes a click. A scene passes it to its <Scene> as the backdrop, which
// keeps it behind the sheet's content and clips it at the sheet's edges.
export function Mark({ angle, className, sizes, rotate, y, priority = false, ref }: MarkProps) {
  return (
    <motion.picture
      ref={ref}
      className={`${styles.mark} ${className}`}
      style={{ rotate, y }}
      aria-hidden="true"
      data-scene-visual=""
    >
      <source type="image/avif" srcSet={srcSet(angle, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(angle, "webp")} sizes={sizes} />
      <img
        src={file(`mark-${angle}-960.png`)}
        width={SIDE}
        height={SIDE}
        alt=""
        loading={priority ? undefined : "lazy"}
        decoding="async"
      />
    </motion.picture>
  );
}
