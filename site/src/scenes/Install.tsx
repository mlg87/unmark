import { animate, motion, useInView, useMotionValue, type Variants } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { AppIconTile } from "../ui/AppIconTile.tsx";
import { Button } from "../ui/Button.tsx";
import { CopyCommand } from "../ui/CopyCommand.tsx";
import { Mark } from "../ui/Mark.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Install.module.css";

const NO_REDUCE = "(prefers-reduced-motion: no-preference)";

// `hidden` applies at once, before the cards are seen; `shown` pops them back on a spring, 80 ms
// apart (#191). The custom value is the card's position, which also alternates its tilt.
const CARD: Variants = {
  hidden: (index: number) => ({
    scale: 0.9,
    rotate: index % 2 === 0 ? -2 : 2,
    transition: { duration: 0 },
  }),
  shown: (index: number) => ({
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 300, damping: 18, delay: index * 0.08 },
  }),
};

// Everything on the page leads here (#178): both install paths, then the facts that decide it.
export function Install() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  // Cards render at rest, as the prerendered HTML has them, and only shrink for the pop once React
  // runs, so visitors without JavaScript or who asked for less motion never see them small.
  const [armed, setArmed] = useState(false);
  useLayoutEffect(() => {
    setArmed(matchMedia(NO_REDUCE).matches);
  }, []);
  const animate = armed && !inView ? "hidden" : "shown";

  return (
    <div ref={ref} className={styles.install}>
      <AppIconTile size={160} alt="Unmark app icon" />
      <UnmarkHeading level={2}>Get Unmark.</UnmarkHeading>
      <div className={styles.cards}>
        <Card index={0} animate={animate} title="Homebrew">
          <CopyCommand command="brew install mlg87/tap/unmark" />
          <p className={styles.note}>
            Installs the app and the <code className={styles.mono}>unmark</code> command.
          </p>
        </Card>
        <Card index={1} animate={animate} title="Download">
          <Button className={styles.download} href={__RELEASE__.dmgUrl}>
            Download Unmark {__RELEASE__.version}
          </Button>
          <p className={styles.note}>
            Open the DMG and drag Unmark to Applications. Signed and notarized by Apple.
          </p>
        </Card>
      </div>
      <ul className={styles.facts}>
        <li>macOS 14 Sonoma or later</li>
        <li>Apple silicon and Intel</li>
        <li>Updates itself</li>
        <li>Free and open source</li>
      </ul>
    </div>
  );
}

// Sits low in the right corner and turns once, from 6° to −4°, as the section comes into view
// (#195). Static mode holds it at 6°.
export function InstallMark() {
  const mode = useMotionMode();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const rotate = useMotionValue(6);
  const y = useMotionValue("0vh");
  useEffect(() => {
    if (mode === "pinned" && inView) {
      const controls = animate(rotate, -4, { type: "spring", stiffness: 120, damping: 16 });
      return () => controls.stop();
    }
    rotate.set(6);
  }, [mode, inView, rotate]);

  return (
    <Mark
      ref={ref}
      angle="front"
      className={styles.mark}
      sizes="min(26vw, 380px)"
      rotate={rotate}
      y={y}
    />
  );
}

interface CardProps {
  index: number;
  animate: "hidden" | "shown";
  title: string;
  children: ReactNode;
}

function Card({ index, animate, title, children }: CardProps) {
  return (
    <motion.div
      className={styles.card}
      data-block="white"
      custom={index}
      variants={CARD}
      initial={false}
      animate={animate}
    >
      <h3 className={styles.title}>{title}</h3>
      {children}
    </motion.div>
  );
}
