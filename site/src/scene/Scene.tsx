import { type MotionValue, motion, useMotionValue, useScroll, useTransform } from "motion/react";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type MotionMode, sceneHeightSvh, splitProgress } from "./math.ts";
import styles from "./Scene.module.css";
import { useMotionMode } from "./useMotionMode.ts";

export type Block = "navy" | "pink" | "coral" | "blue" | "white";

// Each runs 0 to 1. In static mode all three stay at 1, so a scene drawn from them shows its
// finished state.
export interface SceneValues {
  // While this sheet slides up over the previous one.
  enter: MotionValue<number>;
  // Over the `length` screens that belong to this scene.
  progress: MotionValue<number>;
  // While the next sheet slides up over this one.
  exit: MotionValue<number>;
}

const SceneContext = createContext<SceneValues | null>(null);

export function useScene(): SceneValues {
  const values = useContext(SceneContext);
  if (!values) {
    throw new Error("useScene() needs a <Scene> above it");
  }
  return values;
}

interface SceneProps {
  id: string;
  block: Block;
  // Screens of scroll the scene owns while pinned; null makes it an ordinary block that still
  // slides over the previous sheet.
  length: number | null;
  // Position in the page: stacks later sheets above earlier ones and alternates the tilt.
  index: number;
  // Decoration behind the content, such as the 3D mark (#195). It sits outside the static-mode
  // reveal, whose transform would otherwise move it off the sheet's corner while it plays.
  backdrop?: ReactNode;
  children: ReactNode;
}

export function Scene({ id, block, length, index, backdrop, children }: SceneProps) {
  const mode = useMotionMode();
  const ref = useRef<HTMLElement>(null);
  const values = useSceneValues(ref, mode, length, index === 0);
  const sheetStyle = useSheetStyle(values, mode, index);
  const layout = {
    "--scene-index": index + 1,
    "--scene-height": length === null ? undefined : `${sceneHeightSvh(length)}svh`,
  } as CSSProperties;

  return (
    <section
      id={id}
      ref={ref}
      data-block={block}
      className={length === null ? `${styles.scene} ${styles.unpinned}` : styles.scene}
      style={layout}
    >
      <motion.div className={styles.sheet} style={sheetStyle}>
        <SceneContext value={values}>
          {backdrop && <div className={styles.backdrop}>{backdrop}</div>}
          <Reveal mode={mode}>{children}</Reveal>
        </SceneContext>
      </motion.div>
    </section>
  );
}

function useSceneValues(
  ref: RefObject<HTMLElement | null>,
  mode: MotionMode,
  length: number | null,
  first: boolean,
): SceneValues {
  // The wrapper's top edge travelling from the bottom of the window to the top: the slide-in.
  const { scrollYProgress: entering } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });
  // The whole time the sheet is stuck: its own screens, then the screen it spends being covered.
  const { scrollYProgress: stuck } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const enter = useMotionValue(1);
  const progress = useMotionValue(1);
  const exit = useMotionValue(1);

  // A layout effect so switching to pinned sets the values before the sheet paints with them.
  useLayoutEffect(() => {
    if (mode === "static") {
      enter.set(1);
      progress.set(1);
      exit.set(1);
      return;
    }
    const sync = () => {
      // The first sheet is already in place when the page loads.
      enter.set(first ? 1 : entering.get());
      if (length === null) {
        progress.set(1);
        exit.set(0);
        return;
      }
      const split = splitProgress(stuck.get(), length);
      progress.set(split.progress);
      exit.set(split.exit);
    };
    sync();
    const unsubscribes = [entering.on("change", sync), stuck.on("change", sync)];
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [mode, length, first, entering, stuck, enter, progress, exit]);

  return useMemo(() => ({ enter, progress, exit }), [enter, progress, exit]);
}

// The movement between sheets (#183): the entering sheet's slanted top edge flattens as it lands,
// and the covered sheet shrinks, tilts (alternating direction), and rounds its corners.
// Static mode keeps the style attached but neutral: Motion leaves whatever it last wrote when the
// style goes away, which left sheets slanted and rounded after a switch to static (#202).
function useSheetStyle({ enter, exit }: SceneValues, mode: MotionMode, index: number) {
  const pinned = useMotionValue(0);
  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);
  const clipPath = useTransform([enter, pinned], ([entered = 1, isPinned = 0]: number[]) =>
    index === 0 || !isPinned
      ? "none"
      : `polygon(0 ${(1 - entered) * 8}vw, 100% 0, 100% 100%, 0 100%)`,
  );
  const covered = useTransform(
    [exit, pinned],
    ([exited = 0, isPinned = 0]: number[]) => exited * isPinned,
  );
  const scale = useTransform(covered, [0, 1], [1, 0.92]);
  const rotate = useTransform(covered, [0, 1], [0, index % 2 === 0 ? 1.5 : -1.5]);
  const borderRadius = useTransform(covered, [0, 1], [0, 32]);
  return { clipPath, scale, rotate, borderRadius };
}

const NO_REDUCE = "(prefers-reduced-motion: no-preference)";

// Static mode's one movement: content rises and fades in the first time 30% of it is in view.
// It arms only for content off screen when the page hydrates, so prerendered text the visitor can
// already see never blinks out, and never for visitors who asked for less motion.
function Reveal({ mode, children }: { mode: MotionMode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (
      !element ||
      document.documentElement.dataset.motion === "pinned" ||
      !matchMedia(NO_REDUCE).matches
    ) {
      return;
    }
    const { top, bottom } = element.getBoundingClientRect();
    if (top >= window.innerHeight || bottom <= 0) {
      setArmed(true);
    }
  }, []);

  if (mode === "static" && armed) {
    return (
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <div ref={ref} className={styles.content}>
      {children}
    </div>
  );
}
