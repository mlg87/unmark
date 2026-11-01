// @vitest-environment jsdom

// Source-line markers (unmark-1793451437275-26-1e1952b0) through the full Preview pipeline
// (markdown-it → sanitize → lazy KaTeX and Mermaid → DOM insert), which Split mode's scroll
// sync reads to match each block to the line it starts on.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, test, vi } from "vitest";

// jsdom can't lay out the SVG text Mermaid measures; the broken diagram still fails to parse.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async (id: string, source: string) => {
      if (source.trim().endsWith("-->")) throw new Error("Parse error");
      return { svg: `<svg id="${id}"></svg>` };
    },
  },
}));
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));

import "../src/index.ts";

const kitchenSink = readFileSync(
  join(import.meta.dirname, "../../docs/fixtures/kitchen-sink.md"),
  "utf8",
);
const sourceLines = kitchenSink.split("\n");

let article: Element;

beforeAll(async () => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
  await window.unmark.render(kitchenSink, { documentBaseURL: "file:///docs/" });
});

// Each marked element, in document order: its tag, its 0-based line, and how that line starts.
// biome-ignore format: one row per block reads like the fixture.
const KITCHEN_SINK_BLOCKS: [string, number, string][] = [
  ["table", 0, "---"], // front matter
  ["h1", 4, "# Kitchen sink"],
  ["p", 6, "[![License"],
  ["p", 8, "A fixture"],
  ["h2", 13, "## Table"],
  ["table", 15, "| Feature"], ["thead", 15, "| Feature"], ["tr", 15, "| Feature"],
  ["tbody", 17, "| Tables"], ["tr", 17, "| Tables"],
  ["tr", 18, "| Task lists"],
  ["tr", 19, "| Images"],
  ["h2", 21, "## Task list"],
  ["ul", 23, "- [x] Render a table"], ["li", 23, "- [x] Render a table"],
  ["li", 24, "- [x] Render a task list"],
  ["li", 25, "- [ ] Ship"],
  ["h2", 27, "## Images"],
  ["p", 29, "Relative to this file"],
  ["p", 31, "![Gradient"],
  ["h2", 33, "## Code"],
  ["pre", 35, "```swift"],
  ["div", 40, "> [!NOTE]"], // the alert
  ["p", 41, "> Alerts render"],
  ["h2", 43, "## Math"],
  ["p", 45, "Inline $a_b"],
  ["div", 47, "$$"],
  ["div", 51, "```math"],
  ["p", 55, "TeX KaTeX can't parse"],
  ["h2", 57, "## Diagrams"],
  ["div", 59, "```mermaid"],
  ["p", 63, "A broken diagram"],
  ["div", 65, "```mermaid"],
  ["h2", 69, "## Quotes and lists"],
  ["blockquote", 71, "> A plain blockquote"], ["p", 71, "> A plain blockquote"],
  ["ol", 73, "1. Ordered"], ["li", 73, "1. Ordered"],
  ["ul", 74, "   - nested bullet"], ["li", 74, "   - nested bullet"],
  ["li", 75, "2. Second"],
  ["hr", 77, "---"],
  ["p", 79, "[^1]: Footnotes collect"], // in the footnotes section
];

test("every block in the kitchen sink is marked with the 0-based line it starts on", () => {
  const marked = [...article.querySelectorAll("[data-source-line]")].map((element) => [
    element.localName,
    Number(element.getAttribute("data-source-line")),
  ]);
  expect(marked).toEqual(KITCHEN_SINK_BLOCKS.map(([tag, line]) => [tag, line]));
  for (const [tag, line, start] of KITCHEN_SINK_BLOCKS) {
    expect(sourceLines[line]?.slice(0, start.length), `${tag} on line ${line}`).toBe(start);
  }
});

test("drawn math and diagrams keep their block's marker", () => {
  const replaced = (line: number) => article.querySelector(`[data-source-line="${line}"]`);
  expect(replaced(47)?.querySelector(".katex-display")).not.toBeNull();
  expect(replaced(51)?.querySelector(".katex-display")).not.toBeNull();
  expect(replaced(59)?.matches(".mermaid-diagram")).toBe(true);
  expect(replaced(65)?.querySelector(".mermaid-error")).not.toBeNull();
});
