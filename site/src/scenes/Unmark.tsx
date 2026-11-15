import { motion, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { stagger } from "../scene/math.ts";
import { useScene } from "../scene/Scene.tsx";
import { MarkdownBody } from "../ui/MarkdownBody.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Unmark.module.css";

// One row of raw markdown: the syntax that disappears, then the text that stays.
interface SourceRow {
  mark: string;
  text: string;
}

const LINE_COUNT = 5;

// github.com's light-bulb octicon, which it puts in a Tip alert's title.
const LIGHT_BULB =
  "M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z";

// The product in one picture (#185): the lines of docs/screenshots/sample.md, the document in the
// app's own screenshots, lose their marks one after another and are left as the rendered page.
export function Unmark() {
  const { progress } = useScene();
  const sourceLabel = useTransform(progress, [0.4, 0.6], [1, 0]);
  const previewLabel = useTransform(progress, [0.4, 0.6], [0, 1]);

  return (
    <div className={styles.unmark}>
      <div className={styles.copy}>
        <UnmarkHeading level={2}>Open a file. Read the page.</UnmarkHeading>
        <p>
          Unmark opens every file in Preview mode: your markdown, rendered the way github.com
          renders it. What you see is what your readers will see once you push.
        </p>
      </div>
      <div className={styles.card} data-scene-visual>
        <p className={styles.label}>
          <motion.span aria-hidden="true" style={{ opacity: sourceLabel }}>
            Source
          </motion.span>
          <motion.span style={{ opacity: previewLabel }}>Preview</motion.span>
        </p>
        <Line index={0} source={[{ mark: "# ", text: "Release checklist" }]}>
          {/* An <h3> under the scene's <h2>, dressed as github.com's <h1>: a second <h1> on the page
              would compete with the headline (#210). */}
          <h3 className={styles.title}>Release checklist</h3>
        </Line>
        <Line
          index={1}
          source={[{ mark: "", text: "Unmark shows this file the way GitHub does." }]}
        >
          <p>Unmark shows this file the way GitHub does.</p>
        </Line>
        <Line index={2} source={[{ mark: "- [x] ", text: "Merge the last pull request" }]}>
          <TaskList checked>Merge the last pull request</TaskList>
        </Line>
        <Line index={3} source={[{ mark: "- [ ] ", text: "Write the release notes" }]}>
          <TaskList checked={false}>Write the release notes</TaskList>
        </Line>
        <Line
          index={4}
          source={[
            { mark: "> [!TIP]", text: "" },
            { mark: "> ", text: "Click a checkbox in the Preview to tick it in the file." },
          ]}
        >
          <div className="markdown-alert markdown-alert-tip">
            <p className="markdown-alert-title">
              <svg
                className="octicon octicon-light-bulb mr-2"
                viewBox="0 0 16 16"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path d={LIGHT_BULB} />
              </svg>
              Tip
            </p>
            <p>Click a checkbox in the Preview to tick it in the file.</p>
          </div>
        </Line>
      </div>
    </div>
  );
}

interface LineProps {
  index: number;
  source: SourceRow[];
  // The Preview layer: what github.com renders for the source.
  children: ReactNode;
}

// Both layers share one grid cell. Preview comes first so it leads the reading order; Source is
// decoration for sighted visitors and only appears in pinned mode (Unmark.module.css).
function Line({ index, source, children }: LineProps) {
  const { progress } = useScene();
  // Overlapping windows, so each line starts changing halfway through the one above it.
  const t = useTransform(progress, (value) => stagger(value, index, LINE_COUNT));
  // The marks go first, then the rest of the source gives way to the rendered element.
  const markScale = useTransform(t, [0, 0.5], [1, 0.4]);
  const markOpacity = useTransform(t, [0, 0.5], [1, 0]);
  const sourceOpacity = useTransform(t, [0.3, 0.7], [1, 0]);
  const previewOpacity = useTransform(t, [0.4, 0.9], [0, 1]);
  const previewY = useTransform(t, [0.4, 0.9], [8, 0]);

  return (
    <div className={styles.line}>
      <motion.div style={{ opacity: previewOpacity, y: previewY }}>
        <MarkdownBody>{children}</MarkdownBody>
      </motion.div>
      <motion.div aria-hidden="true" className={styles.source} style={{ opacity: sourceOpacity }}>
        {source.map(({ mark, text }) => (
          <div key={`${mark}${text}`}>
            {mark && (
              <motion.span
                className={styles.mark}
                style={{ scale: markScale, opacity: markOpacity }}
              >
                {mark}
              </motion.span>
            )}
            {text}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// github.com's task list markup; its checkboxes are disabled outside an editable view.
function TaskList({ checked, children }: { checked: boolean; children: string }) {
  return (
    <ul className="contains-task-list">
      <li className="task-list-item">
        <label>
          <input
            type="checkbox"
            className="task-list-item-checkbox"
            defaultChecked={checked}
            disabled
          />{" "}
          {children}
        </label>
      </li>
    </ul>
  );
}
