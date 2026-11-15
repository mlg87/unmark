import { easeInOut, type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import {
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react";
import type { MotionMode } from "../scene/math.ts";
import type { Block } from "../scene/Scene.tsx";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { Mark, useMarkScroll } from "../ui/Mark.tsx";
import { MarkdownBody } from "../ui/MarkdownBody.tsx";
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

// github.com's 16px octicons for the Note and Warning alert titles (renderer/src/alerts.css).
const INFO =
  "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z";
const ALERT =
  "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z";

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
        <Alert kind="note" title="Note" icon={INFO}>
          Unmark updates itself through Sparkle.
        </Alert>
        <Alert kind="warning" title="Warning" icon={ALERT}>
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

// How far the track runs past the sheet's inner width, in pixels; 0 when it fits or in static mode.
// The gallery also stretches to the sheet's inner width, wider than the page's text column on large
// windows, so the cards use the whole sheet.
function useTrackOverflow(
  galleryRef: RefObject<HTMLDivElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
  mode: MotionMode,
): MotionValue<number> {
  const overflow = useMotionValue(0);

  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    const track = trackRef.current;
    // The sheet is the section's only child (Scene.tsx).
    const sheet = gallery?.closest("section")?.firstElementChild;
    if (mode !== "pinned" || !gallery || !track || !(sheet instanceof HTMLElement)) {
      overflow.set(0);
      return;
    }
    const measure = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(sheet);
      const inner =
        sheet.clientWidth - Number.parseFloat(paddingLeft) - Number.parseFloat(paddingRight);
      gallery.style.setProperty("--sheet-inner", `${inner}px`);
      overflow.set(Math.max(0, track.scrollWidth - inner));
    };
    // The sheet resizes with the window; the track when the fonts arrive.
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(track);
    return () => {
      observer.disconnect();
      gallery.style.removeProperty("--sheet-inner");
      overflow.set(0);
    };
  }, [galleryRef, trackRef, mode, overflow]);

  return overflow;
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

interface AlertProps {
  kind: "note" | "warning";
  title: string;
  icon: string;
  children: string;
}

function Alert({ kind, title, icon, children }: AlertProps) {
  return (
    <div className={`markdown-alert markdown-alert-${kind}`}>
      <p className="markdown-alert-title">
        <svg
          className={`octicon ${kind === "note" ? "octicon-info" : "octicon-alert"} mr-2`}
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path d={icon} />
        </svg>
        {title}
      </p>
      <p>{children}</p>
    </div>
  );
}

// github.com's task list markup; its checkboxes are disabled outside an editable view.
function TaskItem({ checked, children }: { checked: boolean; children: ReactNode }) {
  return (
    <li className="task-list-item">
      <input
        type="checkbox"
        className="task-list-item-checkbox"
        defaultChecked={checked}
        disabled
      />{" "}
      {children}
    </li>
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
