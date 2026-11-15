import { type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import { useLayoutEffect } from "react";
import { stagger, typed } from "../scene/math.ts";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Terminal.module.css";

// From README.md: the Homebrew install, the first `unmark`, and git's editor with `--wait` (#189).
const COMMANDS = [
  "brew install mlg87/tap/unmark",
  "unmark README.md",
  'git config --global core.editor "unmark --wait"',
  "git commit",
];

// Each command's window overlaps the next by a fifth, so one is nearly typed when the next starts.
const OVERLAP = 0.2;

// The newest command that has started typing; the first one waits at its prompt before that.
function activeLine(progress: number): number {
  let active = 0;
  for (let index = 1; index < COMMANDS.length; index++) {
    if (stagger(progress, index, COMMANDS.length, OVERLAP) > 0) {
      active = index;
    }
  }
  return active;
}

// The `unmark` command and `--wait` (#189): the commands type themselves, one after another, as
// the visitor scrolls through the pinned sheet.
export function Terminal() {
  const mode = useMotionMode();
  // Static mode keeps every style attached but neutral: Motion leaves whatever it last wrote when
  // a style goes away (#202).
  const pinned = useMotionValue(0);
  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);

  return (
    <div className={styles.terminal}>
      <div className={styles.copy}>
        <UnmarkHeading level={2}>At home in your terminal.</UnmarkHeading>
        <p>
          Open any file from the shell, or make Unmark the editor git opens for commit messages.{" "}
          <code className={styles.flag}>--wait</code> holds the command until you close the window.
        </p>
      </div>
      <div className={styles.card} data-scene-visual="">
        <div className={styles.title}>zsh</div>
        <div className={styles.screen}>
          {/* The animated lines are decoration; this copy is what screen readers and the
              prerendered HTML get. */}
          <pre className={styles.visuallyHidden}>{COMMANDS.join("\n")}</pre>
          <div aria-hidden="true">
            {COMMANDS.map((command, index) => (
              <Line key={command} command={command} index={index} pinned={pinned} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface LineProps {
  command: string;
  index: number;
  pinned: MotionValue<number>;
}

function Line({ command, index, pinned }: LineProps) {
  const { progress } = useScene();
  const text = useTransform(progress, (value) =>
    typed(command, stagger(value, index, COMMANDS.length, OVERLAP)),
  );
  // Later prompts keep their space so the card's height never changes while it types.
  const visibility = useTransform(progress, (value) =>
    index <= activeLine(value) ? "visible" : "hidden",
  );
  // Explicit inputs: a function that returns early reads only some of its values, and Motion would
  // then stop following the others.
  const cursor = useTransform([pinned, progress], ([isPinned = 0, value = 1]: number[]) =>
    isPinned && activeLine(value) === index ? "inline-block" : "none",
  );

  return (
    <motion.div className={styles.line} style={{ visibility }}>
      <span className={styles.prompt}>$ </span>
      <motion.span>{text}</motion.span>
      <motion.span className={styles.cursor} style={{ display: cursor }} />
    </motion.div>
  );
}
