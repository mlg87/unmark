import { motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { useLayoutEffect, useState } from "react";
import { clamp } from "../scene/math.ts";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { Keycap } from "../ui/Keycap.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import { WindowShot } from "../ui/WindowShot.tsx";
import styles from "./Split.module.css";

// View → Show Source, the shortcut that switches a window to Split mode (README.md).
const SHORTCUT = ["⇧", "⌘", "E"];

// The window opens over this stretch of `progress` (#187): before it only the Preview shows,
// after it the whole window holds still until the next sheet arrives.
const OPEN_FROM = 0.2;
const OPEN_TO = 0.8;

// The app's own ⇧⌘E in one picture (#187): split-dark's Preview half, centered, opens to the
// left until the Source sits beside it.
export function Split() {
  const mode = useMotionMode();
  const { progress } = useScene();
  const pinned = useMotionValue(0);
  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);

  // 1 while only the Preview half shows, 0 once the window is whole. Static mode keeps the styles
  // attached but neutral: Motion leaves whatever it last wrote when a style goes away (#202).
  const closed = useTransform(
    [pinned, progress],
    ([isPinned = 0, p = 1]: number[]) =>
      isPinned * (1 - clamp((p - OPEN_FROM) / (OPEN_TO - OPEN_FROM))),
  );
  // split-dark divides its panes at exactly half its width, so a 50% inset hides the Source and a
  // -25% shift centers the half that is left.
  const clipPath = useTransform([pinned, closed], ([isPinned = 0, c = 0]: number[]) =>
    isPinned ? `inset(0 0 0 ${50 * c}% round 12px)` : "none",
  );
  const transform = useTransform([pinned, closed], ([isPinned = 0, c = 0]: number[]) =>
    isPinned ? `translateX(${-25 * c}%)` : "none",
  );

  // The keycaps pop in once, when the window starts to open, rather than following the scroll.
  // Static mode holds `progress` at 1, so there they are simply in place.
  const [keysShown, setKeysShown] = useState(() => progress.get() >= OPEN_FROM);
  useMotionValueEvent(progress, "change", (p) => setKeysShown(p >= OPEN_FROM));

  return (
    <div className={styles.split}>
      <div className={styles.copy}>
        <UnmarkHeading level={2}>Edit beside the page.</UnmarkHeading>
        <div className={styles.details}>
          <p>
            Split mode puts the Source next to the Preview. The Preview follows every keystroke, and
            scrolling one side keeps the other on the same line.
          </p>
          <p className={styles.shortcut}>
            <span className={styles.keys}>
              {SHORTCUT.map((key, index) => (
                <motion.span
                  key={key}
                  className={styles.key}
                  initial={false}
                  animate={keysShown ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 22,
                    delay: keysShown ? index * 0.08 : 0,
                  }}
                >
                  <Keycap>{key}</Keycap>
                </motion.span>
              ))}
            </span>
            Show Source
          </p>
        </div>
      </div>
      <div className={styles.stage}>
        <motion.div className={styles.window} style={{ clipPath, transform }} data-scene-visual>
          <WindowShot
            shot="split-dark"
            sizes="min(1200px, 86vw)"
            alt="Unmark in Split mode: the markdown Source on the left, the rendered Preview on the right"
          />
        </motion.div>
      </div>
    </div>
  );
}
