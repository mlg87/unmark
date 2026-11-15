import { spring } from "motion";
import { type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import { type CSSProperties, useLayoutEffect } from "react";
import { clamp } from "../scene/math.ts";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { Button } from "../ui/Button.tsx";
import { CopyCommand } from "../ui/CopyCommand.tsx";
import { Mark } from "../ui/Mark.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import { WindowShot } from "../ui/WindowShot.tsx";
import styles from "./Hero.module.css";

// The load animation is CSS, not Motion, so it plays over the prerendered HTML instead of waiting
// for a script to hide and replay it. Motion still supplies the spring, as a `linear()` easing (#184).
const SPRING = spring({ stiffness: 200, damping: 24, keyframes: [0, 1] }).toString();
const SPRING_STYLE = { "--spring": SPRING } as CSSProperties;

// The header sits above this sheet, so the sheet pins one header-height late and `progress` only
// reaches about 0.91 after one window height of scroll. Settling by 0.9 has the window flat by
// then, as #184 asks.
const SETTLED_AT = 0.9;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

// 0 to 1 as the window settles flat. Static mode keeps every style attached but neutral, holding
// this at 0: Motion leaves whatever it last wrote when a style goes away (#202).
function useSettled(): { pinned: MotionValue<number>; settled: MotionValue<number> } {
  const mode = useMotionMode();
  const { progress } = useScene();
  const pinned = useMotionValue(0);
  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);
  const settled = useTransform(
    [pinned, progress],
    ([isPinned = 0, p = 1]: number[]) => isPinned * clamp(p / SETTLED_AT),
  );
  return { pinned, settled };
}

export function Hero() {
  const { pinned, settled: t } = useSettled();
  const copyY = useTransform(t, (settled) => `${-30 * settled}vh`);
  const copyOpacity = useTransform(t, (settled) => 1 - clamp(settled / 0.6));
  // Faded out, the actions still sit under the window picture, which lets clicks through; hidden,
  // they take neither clicks nor keyboard focus.
  const copyVisibility = useTransform(copyOpacity, (opacity) =>
    opacity > 0 ? "visible" : "hidden",
  );
  // Explicit inputs: a function that returns early reads only some of its values, and Motion would
  // then stop following the others.
  const windowTransform = useTransform([pinned, t], ([isPinned = 0, settled = 0]: number[]) =>
    isPinned
      ? `translateY(${lerp(55, 8, settled)}vh) perspective(1600px) rotateX(${lerp(28, 0, settled)}deg) scale(${lerp(0.8, 1, settled)})`
      : "none",
  );

  return (
    <div className={styles.hero} style={SPRING_STYLE}>
      <motion.div
        className={styles.copy}
        style={{ y: copyY, opacity: copyOpacity, visibility: copyVisibility }}
      >
        <UnmarkHeading level={1}>Markdown, the way GitHub shows it.</UnmarkHeading>
        <div className={styles.details}>
          <p className={styles.lede}>
            Unmark is a lightweight Mac app for reading and editing markdown files. Every file opens
            as a rendered page, styled like github.com.
          </p>
          <div className={styles.actions}>
            <Button href={__RELEASE__.dmgUrl}>Download for macOS</Button>
            <CopyCommand command="brew install mlg87/tap/unmark" />
          </div>
          <p className={styles.requirements}>
            Version {__RELEASE__.version} · macOS 14 or later · Apple silicon and Intel
          </p>
        </div>
      </motion.div>
      <div className={styles.windowRise} data-scene-visual="">
        <motion.div className={styles.window} style={{ transform: windowTransform }}>
          <WindowShot
            shot="preview-light"
            priority
            sizes="min(1100px, 80vw)"
            alt="Unmark in Preview mode: a rendered release checklist, with the Outline of its headings on the left"
          />
        </motion.div>
      </div>
    </div>
  );
}

// The 3D mark took the large icon tile's place (#195): it drops in on load like the tile did, then
// turns and rises as the window settles.
export function HeroMark() {
  const { settled } = useSettled();
  const rotate = useTransform(settled, (t) => lerp(-8, 12, t));
  const y = useTransform(settled, (t) => `${-40 * t}vh`);
  return (
    <div style={SPRING_STYLE}>
      <Mark
        angle="front-left"
        className={styles.mark}
        sizes="min(38vw, 560px)"
        rotate={rotate}
        y={y}
        priority
      />
    </div>
  );
}
