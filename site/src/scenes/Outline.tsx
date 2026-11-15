import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useLayoutEffect } from "react";
import { clamp } from "../scene/math.ts";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { Keycap } from "../ui/Keycap.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import { WindowShot } from "../ui/WindowShot.tsx";
import styles from "./Outline.module.css";

// README.md's shortcuts for getting around a long file: the Outline, Find, and zoom.
const SHORTCUTS = [
  { keys: ["⌃", "⌘", "S"], label: "Outline" },
  { keys: ["⌘", "F"], label: "Find" },
  { keys: ["⌘", "G"], label: "Next match" },
  { keys: ["⌘", "+"], label: "Zoom in" },
];

const ZOOMED_AT = 0.4;
const ZOOM = 1.9;
// Where the highlight lands on each Outline row, top to bottom: Release checklist, Before tagging,
// Build, Flow (#188). The rows are evenly spaced, so the highlight moves one row height per step.
const ROW_STARTS = [ZOOMED_AT, 0.55, 0.7, 0.85];

// Getting around a long file (#188): the frame closes in on the screenshot's Outline, then a
// highlight steps down its headings the way the Outline follows the Preview.
export function Outline() {
  const mode = useMotionMode();
  const { progress } = useScene();
  const pinned = useMotionValue(0);
  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);

  // Static mode keeps every style attached but neutral: Motion leaves whatever it last wrote when
  // a style goes away (#202).
  const scale = useTransform(
    [pinned, progress],
    ([isPinned = 0, p = 1]: number[]) => 1 + isPinned * (ZOOM - 1) * clamp(p / ZOOMED_AT),
  );
  // The row the highlight sits on, or -1 while it is hidden.
  const row = useTransform([pinned, progress], ([isPinned = 0, p = 1]: number[]) =>
    isPinned ? ROW_STARTS.filter((start) => p >= start).length - 1 : -1,
  );
  const highlightOpacity = useTransform(row, (index) => (index < 0 ? 0 : 1));
  const highlightRow = useSpring(
    useTransform(row, (index) => Math.max(index, 0)),
    { stiffness: 300, damping: 30 },
  );
  // In units of the highlight's own height, which is one row's.
  const highlightY = useTransform(highlightRow, (index) => `${index * 100}%`);

  return (
    <div className={styles.outline}>
      <div className={styles.copy}>
        <UnmarkHeading level={2}>Never lose your place.</UnmarkHeading>
        <p>
          The Outline lists every heading and follows along as you scroll. Find searches the Preview
          or the Source, and zoom works on whichever side has focus.
        </p>
        <ul className={styles.shortcuts}>
          {SHORTCUTS.map(({ keys, label }) => (
            <li key={label}>
              <span className={styles.keys}>
                {keys.map((key) => (
                  <Keycap key={key}>{key}</Keycap>
                ))}
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.frame} data-scene-visual="">
        <motion.div className={styles.layer} style={{ scale }}>
          <WindowShot
            shot="preview-light"
            sizes="min(900px, 80vw)"
            className={styles.shot}
            alt="Unmark's Outline beside the Preview, listing the headings Release checklist, Before tagging, Build, and Flow"
          />
          <motion.div
            aria-hidden="true"
            className={styles.highlight}
            style={{ opacity: highlightOpacity, y: highlightY }}
          />
        </motion.div>
      </div>
    </div>
  );
}
