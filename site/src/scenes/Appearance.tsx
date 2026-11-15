import { motion, useTransform } from "motion/react";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import { type Screenshot, WindowShot } from "../ui/WindowShot.tsx";
import styles from "./Appearance.module.css";

type Theme = "light" | "dark";

const SHOTS: Record<Theme, { shot: Screenshot; alt: string }> = {
  light: { shot: "preview-light", alt: "Unmark's Preview in the light appearance" },
  dark: { shot: "preview-dark", alt: "Unmark's Preview in the dark appearance" },
};

// The wipe's edge leans this far either side of its midpoint, as a share of the sheet's width.
const LEAN = 8;

// The app follows the Mac's appearance with github.com's light and dark themes (#178), and the two
// screenshots line up pixel for pixel, so one wipes across the other and takes the sheet with it
// (#190).
export function Appearance() {
  const mode = useMotionMode();
  const { progress } = useScene();
  // The edge's midpoint runs from just off the left of the sheet to just off its right, so the
  // sheet starts all light and ends all dark before the next one covers it.
  const edge = useTransform(progress, [0.15, 0.85], [-10, 110], { clamp: true });
  const darkClip = useTransform(
    edge,
    (x) => `polygon(0 0, ${x + LEAN}% 0, ${x - LEAN}% 100%, 0 100%)`,
  );

  if (mode === "static") {
    return (
      <>
        <Copy />
        <div className={styles.pair}>
          {(["light", "dark"] as const).map((theme) => (
            <figure key={theme} className={styles.figure} data-scene-visual="">
              <Shot theme={theme} sizes="(min-width: 700px) 50vw, 100vw" />
              <figcaption className={styles.caption}>
                {theme === "light" ? "Light" : "Dark"}
              </figcaption>
            </figure>
          ))}
        </div>
      </>
    );
  }
  // Two identical copies stacked over the whole sheet, so the clip's edge cuts through the
  // heading, the paragraph, and the picture at the same place. Screen readers meet only the
  // light one.
  return (
    <>
      <div className={styles.layer} data-block="white">
        <Content theme="light" />
      </div>
      <motion.div
        className={styles.layer}
        data-block="navy"
        aria-hidden="true"
        style={{ clipPath: darkClip }}
      >
        <Content theme="dark" />
      </motion.div>
    </>
  );
}

function Content({ theme }: { theme: Theme }) {
  return (
    <div className={styles.content}>
      <div className={styles.copy}>
        <Copy />
      </div>
      <div className={styles.window} data-scene-visual="">
        <Shot theme={theme} sizes="min(72vh, 820px)" />
      </div>
    </div>
  );
}

function Copy() {
  return (
    <>
      <UnmarkHeading level={2}>Light or dark, it matches GitHub.</UnmarkHeading>
      <p className={styles.paragraph}>
        The Preview follows your Mac's appearance, with github.com's light and dark themes for text,
        code, and diagrams.
      </p>
    </>
  );
}

function Shot({ theme, sizes }: { theme: Theme; sizes: string }) {
  const { shot, alt } = SHOTS[theme];
  return <WindowShot shot={shot} alt={alt} sizes={sizes} />;
}
