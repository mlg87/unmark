import { easeInOut, type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import { type HTMLAttributes, type ReactNode, useLayoutEffect, useRef } from "react";
import type { Block } from "../scene/Scene.tsx";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { useTrackOverflow } from "../scene/useTrackOverflow.ts";
import { Mark, useMarkScroll } from "../ui/Mark.tsx";
import { MarkdownBody } from "../ui/MarkdownBody.tsx";
import { Alert, TaskItem } from "../ui/MarkdownParts.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./GitHub.module.css";

// React's JSX types cover HTML and SVG only. The page loads no KaTeX, so the Math card writes its
// one expression as MathML, which browsers render natively.
type MathMLProps = HTMLAttributes<HTMLElement> & { display?: "block" | "inline" };
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps;
      mn: MathMLProps;
      mo: MathMLProps;
      msup: MathMLProps;
    }
  }
}

// Degrees each card's tilt travels, toward the opposite sign, over the scene.
const TILT_TRAVEL = 3;
const TILT = 2;

interface CardDefinition {
  title: string;
  frame: Block;
  content: ReactNode;
}

// The examples are lines of docs/screenshots/sample.md, the document in the app's own screenshots,
// written out as the HTML github.com renders for them (#186).
const CARDS: CardDefinition[] = [
  {
    title: "Tables",
    frame: "blue",
    content: (
      <table>
        <thead>
          <tr>
            <th align="left">Step</th>
            <th align="left">Command</th>
            <th align="right">Time</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td align="left">Lint</td>
            <td align="left">
              <code>make lint</code>
            </td>
            <td align="right">40 s</td>
          </tr>
          <tr>
            <td align="left">Test</td>
            <td align="left">
              <code>make test</code>
            </td>
            <td align="right">2 min</td>
          </tr>
          <tr>
            <td align="left">DMG</td>
            <td align="left">
              <code>scripts/release/build-dmg.sh</code>
            </td>
            <td align="right">6 min</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    title: "Alerts",
    frame: "pink",
    content: (
      <>
        <Alert kind="note">Unmark updates itself through Sparkle.</Alert>
        <Alert kind="warning">
          The appcast must list the new version before the DMG goes live.
        </Alert>
      </>
    ),
  },
  {
    title: "Code",
    frame: "coral",
    content: (
      <div className="highlight highlight-source-swift">
        <pre>
          <span className={styles.keyword}>let</span> version = {""}
          <span className={styles.string}>"1.2.0"</span>
          {"\n"}
          <span className={styles.builtIn}>print</span>(
          <span className={styles.string}>"Releasing Unmark </span>
          {"\\(version)"}
          <span className={styles.string}>"</span>)
        </pre>
      </div>
    ),
  },
  {
    title: "Math",
    frame: "navy",
    content: (
      <p>
        The DMG stays under{" "}
        <math display="inline">
          <mn>30</mn>
          <mo>×</mo>
          <msup>
            <mn>10</mn>
            <mn>6</mn>
          </msup>
        </math>{" "}
        bytes.
      </p>
    ),
  },
  {
    title: "Diagrams",
    frame: "blue",
    content: <Flowchart />,
  },
  {
    title: "Task lists",
    frame: "pink",
    content: (
      <ul className="contains-task-list">
        <TaskItem checked>Merge the last pull request</TaskItem>
        <TaskItem checked>
          Run <code>make test</code> on the oldest Mac
        </TaskItem>
        <TaskItem checked={false}>Write the release notes</TaskItem>
      </ul>
    ),
  },
];

// The scene's proof of "renders like GitHub" (#186): six rendered examples that slide sideways
// while the page scrolls down, the page's second kind of movement.
export function GitHub() {
  const mode = useMotionMode();
  const { progress } = useScene();
  const galleryRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pinned = useMotionValue(0);
  const overflow = useTrackOverflow(galleryRef, trackRef, mode);
  // Starts with the first card at the left edge and ends with the last card at the right edge.
  const x = useTransform([progress, overflow], ([p = 0, o = 0]: number[]) => -p * o);
  // A track that fits stays still, tilt included.
  const slide = useTransform([progress, overflow], ([p = 0, o = 0]: number[]) => (o > 0 ? p : 0));

  useLayoutEffect(() => {
    pinned.set(mode === "pinned" ? 1 : 0);
  }, [mode, pinned]);

  return (
    <div className={styles.github}>
      <div className={styles.copy}>
        <UnmarkHeading level={2}>If GitHub renders it, so does Unmark.</UnmarkHeading>
        <p>
          Tables, task lists, alerts, highlighted code, math, Mermaid diagrams, footnotes, emoji,
          and front matter.
        </p>
      </div>
      <div ref={galleryRef} className={styles.gallery} data-scene-visual>
        <motion.div ref={trackRef} className={styles.track} style={{ x }}>
          {CARDS.map((card, index) => (
            <Card key={card.title} card={card} index={index} slide={slide} pinned={pinned} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// Hangs off the sheet's top right corner, turning and sinking as the sheet arrives (#195).
export function GitHubMark() {
  const { rotate, y } = useMarkScroll(10, -6, 6);
  return (
    <Mark angle="front" className={styles.mark} sizes="min(24vw, 360px)" rotate={rotate} y={y} />
  );
}

interface CardProps {
  card: CardDefinition;
  index: number;
  slide: MotionValue<number>;
  pinned: MotionValue<number>;
}

// Cards tilt -2° and +2° in turn and ease 3° toward the other side as the track slides. Static mode
// keeps the style attached but flat: Motion leaves whatever it last wrote when a style goes away
// (#202).
function Card({ card, index, slide, pinned }: CardProps) {
  const start = index % 2 === 0 ? -TILT : TILT;
  const end = start - Math.sign(start) * TILT_TRAVEL;
  const rotate = useTransform([slide, pinned], ([t = 0, isPinned = 0]: number[]) =>
    isPinned ? start + (end - start) * easeInOut(t) : 0,
  );

  return (
    <motion.div className={styles.card} data-block={card.frame} style={{ rotate }}>
      <h3 className={styles.title}>{card.title}</h3>
      <MarkdownBody className={styles.panel}>{card.content}</MarkdownBody>
    </motion.div>
  );
}

// Mermaid's default flowchart for `graph LR; Tag --> Build --> Notarize --> Publish`, drawn by hand
// because the page loads no Mermaid: lavender boxes with a purple stroke, joined by grey arrows.
const FLOW_BOXES = [
  { label: "Tag", width: 60 },
  { label: "Build", width: 70 },
  { label: "Notarize", width: 92 },
  { label: "Publish", width: 82 },
];
// Room for the arrow between two boxes.
const FLOW_GAP = 40;
const FLOW_HEIGHT = 44;
// Insets the boxes so their 1px stroke isn't clipped at the viewBox's edges.
const FLOW_INSET = 2;
const FLOW_NODES = FLOW_BOXES.map((box, index) => ({
  ...box,
  x:
    FLOW_INSET +
    FLOW_BOXES.slice(0, index).reduce((sum, previous) => sum + previous.width + FLOW_GAP, 0),
}));
const FLOW_WIDTH =
  FLOW_BOXES.reduce((sum, box) => sum + box.width, 0) +
  FLOW_GAP * (FLOW_BOXES.length - 1) +
  2 * FLOW_INSET;

function Flowchart() {
  const middle = FLOW_INSET + FLOW_HEIGHT / 2;
  return (
    <svg
      className={styles.flowchart}
      viewBox={`0 0 ${FLOW_WIDTH} ${FLOW_HEIGHT + 2 * FLOW_INSET}`}
      role="img"
      aria-label="Flowchart: Tag, Build, Notarize, Publish"
    >
      {FLOW_NODES.slice(1).map(({ label, x }) => {
        const tail = x - FLOW_GAP;
        const head = x - 1;
        return (
          <g key={label}>
            <line
              x1={tail}
              y1={middle}
              x2={head - 8}
              y2={middle}
              stroke="#333333"
              strokeWidth="2"
            />
            <polygon
              points={`${head},${middle} ${head - 9},${middle - 5} ${head - 9},${middle + 5}`}
              fill="#333333"
            />
          </g>
        );
      })}
      {FLOW_NODES.map(({ label, x, width }) => (
        <g key={label}>
          <rect
            x={x}
            y={FLOW_INSET}
            width={width}
            height={FLOW_HEIGHT}
            fill="#ECECFF"
            stroke="#9370DB"
          />
          <text
            x={x + width / 2}
            y={middle}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#333333"
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
