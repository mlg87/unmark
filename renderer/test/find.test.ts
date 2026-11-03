// @vitest-environment jsdom

// The match count of the Preview's find bar (unmark-1793451439168-30-08e35535), which must agree
// with the matches WKWebView.find steps through.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { countMatches } from "../src/find.ts";

// jsdom can't lay out the SVG text Mermaid measures; the broken diagram still fails to parse.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async (id: string, source: string) => {
      if (source.trim().endsWith("-->")) throw new Error("Parse error");
      return { svg: `<svg id="${id}"><style>#${id} .theme { fill: red; }</style></svg>` };
    },
  },
}));
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));

import "../src/index.ts";

function count(html: string, query: string): number {
  const root = document.createElement("article");
  root.innerHTML = html;
  return countMatches(root, query);
}

// Mermaid's diagram carries "the" in its CSS, which renders nothing, so it mustn't count.
test("the kitchen-sink fixture has 4 matches for 'the', whatever their case", async () => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  const kitchenSink = readFileSync(
    join(import.meta.dirname, "../../docs/fixtures/kitchen-sink.md"),
    "utf8",
  );
  await window.unmark.render(kitchenSink, { documentBaseURL: "file:///docs/" });
  expect(await window.unmark.countMatches("the")).toBe(4);
  expect(await window.unmark.countMatches("THE")).toBe(4);
});

test("counts matches inside words and doesn't overlap them", () => {
  expect(count("<p>The other theme</p>", "the")).toBe(3);
  expect(count("<p>aaaa</p>", "aa")).toBe(2);
});

test("a match runs across inline elements but not across blocks", () => {
  expect(count("<p>un<strong>mark</strong>ed</p>", "unmarked")).toBe(1);
  expect(count("<p>un</p><p>mark</p>", "unmark")).toBe(0);
  expect(count("<ul><li>un</li><li>mark</li></ul>", "unmark")).toBe(0);
  expect(count("<p>un<br>mark</p>", "unmark")).toBe(0);
});

test("whitespace outside pre matches as the single space it renders as", () => {
  expect(count("<p>soft\nline   break</p>", "soft line break")).toBe(1);
  expect(count("<pre><code>a  b</code></pre>", "a b")).toBe(0);
  expect(count("<pre><code>a  b</code></pre>", "a  b")).toBe(1);
});

test("text that never renders isn't counted", () => {
  expect(count("<p>shown</p><svg><style>.shown {}</style></svg>", "shown")).toBe(1);
});

test("the query is literal text, not a pattern", () => {
  expect(count("<p>a.b axb (c) [d]</p>", "a.b")).toBe(1);
  expect(count("<p>a.b axb (c) [d]</p>", "(c)")).toBe(1);
  expect(count("<p>a.b axb (c) [d]</p>", "[d]")).toBe(1);
  expect(count("<p>anything</p>", "")).toBe(0);
});
