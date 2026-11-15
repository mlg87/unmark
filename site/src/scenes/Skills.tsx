import { motion, useTransform } from "motion/react";
import { type ReactNode, useRef } from "react";
import type { Block } from "../scene/Scene.tsx";
import { useScene } from "../scene/Scene.tsx";
import { useMotionMode } from "../scene/useMotionMode.ts";
import { useTrackFit } from "../scene/useTrackFit.ts";
import { useTrackOverflow } from "../scene/useTrackOverflow.ts";
import { CopyCommand } from "../ui/CopyCommand.tsx";
import { MarkdownBody } from "../ui/MarkdownBody.tsx";
import { Alert, TaskItem } from "../ui/MarkdownParts.tsx";
import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Skills.module.css";

// A run of inline text in a panel: plain, or the inline element Unmark renders it as.
type Run = string | { code: string } | { strong: string } | { link: string };

// The examples are real agent runs that #235 saved in docs/fixtures/skills/, written out as the
// HTML Unmark renders for them. skills.test.ts holds every visible run to its fixture file.
const POLISH_BEFORE =
  "To deploy first you pull main then you run make build and wait for it to finish (takes about 4 minutes) then run make deploy ENV=staging and check the staging dashboard at https://staging.example.com/health and if it says ok you can run make deploy ENV=prod, if it does not say ok roll back with make rollback ENV=staging and ask in #deploys.";

// The fixture's steps also carry a code block each; the panel leaves them out so the card fits a
// pinned sheet's height.
const POLISH_STEPS: Run[][] = [
  ["Pull ", { code: "main" }, "."],
  ["Run the build and wait for it to finish. It takes about 4 minutes."],
  ["Deploy to staging."],
  ["Check the staging dashboard at ", { link: "https://staging.example.com/health" }, "."],
  ["If the dashboard says ok, deploy to prod."],
  ["If the dashboard does not say ok, roll back staging and ask in #deploys."],
];

const POLISH_ALERT = "Never deploy on Fridays after 3pm.";

const POLISH_TABLE = [
  ["Attribute", "Staging", "Prod"],
  ["Replicas", "1", "6"],
  ["Payment key", "Test", "Live"],
  ["Deploy time", "About 2 minutes", "About 10 minutes"],
];

const RECAP_DECISIONS_HEADING = "Decisions";
const RECAP_DECISIONS = [
  "Cache tax rates for one hour.",
  "Keep the 500 ms target for this quarter.",
];
const RECAP_ACTIONS_HEADING = "Action items";
const RECAP_ACTIONS: Run[][] = [
  [{ strong: "Sam" }, ": Ship the one-hour cache for tax rates. Due 2026-11-13."],
  [{ strong: "Priya" }, ": Ask finance whether a one-hour-old tax rate is acceptable. Due TBD."],
  [{ strong: "TBD" }, ": Update the dashboard to show p95 by region. Due TBD."],
];

function runText(run: Run): string {
  if (typeof run === "string") {
    return run;
  }
  if ("code" in run) {
    return run.code;
  }
  return "strong" in run ? run.strong : run.link;
}

// Every run of visible text in the three example panels, keyed by the fixture it comes from.
export const EXAMPLE_TEXT: Record<string, string[]> = {
  "polish-before.md": [POLISH_BEFORE],
  "polish-after.md": [...POLISH_STEPS.flat().map(runText), POLISH_ALERT, ...POLISH_TABLE.flat()],
  "recap.md": [
    RECAP_DECISIONS_HEADING,
    ...RECAP_DECISIONS,
    RECAP_ACTIONS_HEADING,
    ...RECAP_ACTIONS.flat().map(runText),
  ],
};

function Runs({ runs }: { runs: Run[] }) {
  return runs.map((run, index) => {
    if (typeof run === "string") {
      return run;
    }
    if ("code" in run) {
      return <code key={index}>{run.code}</code>;
    }
    if ("strong" in run) {
      return <strong key={index}>{run.strong}</strong>;
    }
    return (
      <a key={index} href={run.link}>
        {run.link}
      </a>
    );
  });
}

function PolishExample() {
  return (
    <div className={styles.example}>
      <figure className={styles.figure}>
        <figcaption className={styles.label}>Before</figcaption>
        <MarkdownBody className={styles.panel}>
          <p>{POLISH_BEFORE}</p>
        </MarkdownBody>
      </figure>
      <figure className={styles.figure}>
        <figcaption className={styles.label}>After</figcaption>
        <MarkdownBody className={styles.panel}>
          {/* An inner grid: github-markdown-css's clearfix pseudo-elements on the panel itself
              would take grid cells. */}
          <div className={`${styles.columns} ${styles.after}`}>
            <ol>
              {POLISH_STEPS.map((step) => (
                <li key={step.map(runText).join("")}>
                  <Runs runs={step} />
                </li>
              ))}
            </ol>
            <div>
              <Alert kind="important">{POLISH_ALERT}</Alert>
              <table>
                <thead>
                  <tr>
                    {POLISH_TABLE[0]?.map((cell) => (
                      <th key={cell}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {POLISH_TABLE.slice(1).map(([attribute, ...cells]) => (
                    <tr key={attribute}>
                      <td>{attribute}</td>
                      {cells.map((cell, index) => (
                        <td key={index}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </MarkdownBody>
      </figure>
    </div>
  );
}

function RecapExample() {
  return (
    <MarkdownBody className={styles.panel}>
      <div className={`${styles.columns} ${styles.recap}`}>
        <div>
          <h4>{RECAP_DECISIONS_HEADING}</h4>
          <ol>
            {RECAP_DECISIONS.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ol>
        </div>
        <div>
          <h4>{RECAP_ACTIONS_HEADING}</h4>
          <ul className="contains-task-list">
            {RECAP_ACTIONS.map((action) => (
              <TaskItem key={action.map(runText).join("")} checked={false}>
                <Runs runs={action} />
              </TaskItem>
            ))}
          </ul>
        </div>
      </div>
    </MarkdownBody>
  );
}

interface SkillCard {
  name: string;
  frame: Block;
  writes: string;
  prompt: string;
  // Only the wide cards have one.
  example?: ReactNode;
}

const CARDS: SkillCard[] = [
  {
    name: "unmark-docs",
    frame: "navy",
    writes: "READMEs, guides, and runbooks",
    prompt: "Write a how-to guide for rotating our API signing key.",
  },
  {
    name: "unmark-polish",
    frame: "white",
    writes: "A clearer version of a file you already have",
    prompt: "Spruce up NOTES.md.",
    example: <PolishExample />,
  },
  {
    name: "unmark-api-docs",
    frame: "blue",
    writes: "REST, GraphQL, and SDK references",
    prompt: "Document the API in openapi.yaml.",
  },
  {
    name: "unmark-meeting-docs",
    frame: "coral",
    writes: "Agendas, recaps, and 1:1 documents",
    prompt: "Write a recap of the meeting in transcript.txt.",
    example: <RecapExample />,
  },
  {
    name: "unmark-planning-docs",
    frame: "navy",
    writes: "Requirements, ADRs, and project plans",
    prompt: "Write an ADR. We decided to replace Postgres with SQLite.",
  },
];

// The skills Unmark installs for coding agents (epic #229), which no app screenshot can show: five
// cards that slide sideways while the page scrolls down, as the github scene's do, two of them with
// what an agent wrote.
export function Skills() {
  const mode = useMotionMode();
  const { progress } = useScene();
  const galleryRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useTrackFit(galleryRef, trackRef, mode);
  const overflow = useTrackOverflow(galleryRef, trackRef, mode);
  // Starts with the first card at the left edge and ends with the last card at the right edge.
  const x = useTransform([progress, overflow], ([p = 0, o = 0]: number[]) => -p * o);

  return (
    <div className={styles.skills}>
      <div className={styles.copy}>
        <UnmarkHeading level={2}>Docs your agent gets right.</UnmarkHeading>
        <p className={styles.intro}>
          Unmark comes with five skills for coding agents. They teach an agent which markdown
          element fits each part of a document, and to write it in plain language.
        </p>
        <div className={styles.install}>
          <CopyCommand command="unmark --install-skills" />
          <p className={styles.note}>
            Or open Settings and click Install Skills. Works with Claude Code, Codex, Gemini CLI,
            Qwen Code, and more.
          </p>
        </div>
      </div>
      <div ref={galleryRef} className={styles.gallery} data-scene-visual>
        <motion.div ref={trackRef} className={styles.track} style={{ x }}>
          {CARDS.map((card) => (
            <div
              key={card.name}
              className={card.example ? `${styles.card} ${styles.wide}` : styles.card}
              data-block={card.frame}
            >
              <div className={styles.meta}>
                <div>
                  <h3 className={styles.title}>{card.name}</h3>
                  <p className={styles.writes}>{card.writes}</p>
                </div>
                <p className={styles.prompt}>{card.prompt}</p>
              </div>
              {card.example}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
