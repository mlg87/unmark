import { motion, useMotionTemplate, useTransform } from "motion/react";
import { type CSSProperties, Fragment } from "react";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import styles from "./UnmarkHeading.module.css";

interface UnmarkHeadingProps {
  level: 1 | 2;
  children: string;
}

// The page's signature (#183): as each sheet lands, its heading loses its markdown mark, the way
// Unmark renders `## Heading` as a heading.
export function UnmarkHeading({ level, children }: UnmarkHeadingProps) {
  const mode = useMotionMode();
  const { enter } = useScene();
  const mark = `${"#".repeat(level)} `;
  const markWidth = useTransform(enter, [0.6, 1], [mark.length, 0]);
  const width = useMotionTemplate`${markWidth}ch`;
  const opacity = useTransform(enter, [0.6, 1], [0.45, 0]);
  const scale = useTransform(enter, [0.6, 1], [0.9, 1]);
  const Heading = level === 1 ? "h1" : "h2";

  if (mode === "static") {
    return <Heading>{words(children)}</Heading>;
  }
  return (
    <Heading className={styles.heading}>
      <motion.span aria-hidden="true" className={styles.mark} style={{ width, opacity }}>
        {mark}
      </motion.span>
      <motion.span className={styles.text} style={{ scale }}>
        {words(children)}
      </motion.span>
    </Heading>
  );
}

// Each word in its own span, numbered in `--word-index`, so a scene can move the words one at a
// time: the hero's headline rises word by word on load (#184).
function words(text: string) {
  return text.split(" ").map((word, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <span data-word="" style={{ "--word-index": index } as CSSProperties}>
        {word}
      </span>
    </Fragment>
  ));
}
