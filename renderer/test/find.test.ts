// @vitest-environment jsdom

// The match count of the Preview's find bar (unmark-1793451439168-30-08e35535), which must agree
// with the matches WKWebView.find steps through, and where the selection it steps from sits among
// them, which a render can move (unmark-1793451427523-5-478d1806.3).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, test, vi } from "vitest";
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

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
});

function count(html: string, query: string): number {
  const root = document.createElement("article");
  root.innerHTML = html;
  return countMatches(root, query).count;
}

/** `countMatches` at the point `|` marks in `html`'s text, which a separate text node starts. */
function countAround(html: string, query: string) {
  const root = document.createElement("article");
  root.innerHTML = html.replace("|", '<span id="point"></span>');
  const marker = root.querySelector("#point");
  const node = marker?.nextSibling;
  marker?.remove();
  if (!node) throw new Error("the point is at the end of its parent");
  return countMatches(root, query, { node, offset: 0 });
}

/** Selects `query`'s `index`th match in the page's document, 0-based, as WKWebView.find does. */
function selectMatch(query: string, index: number): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let found = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node as Text).data;
    for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + query.length)) {
      if (found++ !== index) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + query.length);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      return;
    }
  }
  throw new Error(`no match ${index} of ${query}`);
}

// Mermaid's diagram carries "the" in its CSS, which renders nothing, so it mustn't count.
test("the kitchen-sink fixture has 4 matches for 'the', whatever their case", async () => {
  const kitchenSink = readFileSync(
    join(import.meta.dirname, "../../docs/fixtures/kitchen-sink.md"),
    "utf8",
  );
  await window.unmark.render(kitchenSink, { documentBaseURL: "file:///docs/" });
  expect(await window.unmark.countMatches("the")).toMatchObject({ count: 4 });
  expect(await window.unmark.countMatches("THE")).toMatchObject({ count: 4 });
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

test("says how many matches start before the point and whether one starts at it", () => {
  expect(countAround("<p>the |the the</p>", "the")).toEqual({
    count: 3,
    before: 1,
    startsAtPoint: true,
  });
  expect(countAround("<p>the t|he the</p>", "the")).toMatchObject({
    before: 2,
    startsAtPoint: false,
  });
  expect(countAround("<p>the</p><p>x</p><p>|the</p>", "the")).toMatchObject({
    before: 1,
    startsAtPoint: true,
  });
  expect(countAround("<p>|the</p>", "the")).toMatchObject({ before: 0, startsAtPoint: true });
});

test("the point's place ignores whitespace that doesn't render", () => {
  expect(countAround("<p>\n  |the  \n  the</p>", "the")).toEqual({
    count: 2,
    before: 0,
    startsAtPoint: true,
  });
  expect(countAround("<p>a\n\n  |the the</p>", "the")).toMatchObject({
    before: 0,
    startsAtPoint: true,
  });
  expect(countAround("<pre><code>a  |the</code></pre>", "the")).toMatchObject({
    before: 0,
    startsAtPoint: true,
  });
});

test("a point outside the rendered text has no place", () => {
  const root = document.createElement("article");
  root.innerHTML = "<p>the</p>";
  const outside = document.createElement("p");
  outside.textContent = "the";
  expect(countMatches(root, "the", { node: outside, offset: 0 }).before).toBeNull();
  expect(countMatches(root, "the").before).toBeNull();
});

test("a render that keeps the selected match keeps it selected, at its new place", async () => {
  await window.unmark.render("the one\n\nthe two\n", { documentBaseURL: "file:///docs/" });
  selectMatch("the", 1);
  await window.unmark.render("the zero\n\nthe one\n\nthe two\n", {
    documentBaseURL: "file:///docs/",
  });
  expect(await window.unmark.countMatches("the")).toEqual({ count: 3, before: 2, selected: true });
});

test("a render that replaces the selected match leaves a caret where it was", async () => {
  await window.unmark.render("the one\n\nthe two\n\nthe three\n", {
    documentBaseURL: "file:///docs/",
  });
  selectMatch("the", 1);
  await window.unmark.render("the one\n\nthe 2\n\nthe three\n", {
    documentBaseURL: "file:///docs/",
  });
  const matches = await window.unmark.countMatches("the");
  expect(matches).toMatchObject({ count: 3, selected: false });
  expect(getSelection()?.isCollapsed ?? true).toBe(true);
});

test("a selection that isn't a match becomes a caret at its start", async () => {
  await window.unmark.render("the one the two\n", { documentBaseURL: "file:///docs/" });
  const text = document.querySelector("article p")?.firstChild;
  if (!text) throw new Error("no paragraph text");
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 11);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
  expect(await window.unmark.countMatches("the")).toEqual({ count: 2, before: 1, selected: false });
  expect(getSelection()?.isCollapsed).toBe(true);
});
