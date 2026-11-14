// @vitest-environment jsdom

// q47: typing in the Source of a 1 MB file updates the Preview in under 250 ms. The app's
// `keystroke-to-preview` signpost needs Instruments, so this times the renderer's share of it,
// a render's first screen, on the renderer's own entry point with the whole document on the
// page (unmark-1793451427066-4-97884ee7.10).
//
// jsdom understates WebKit, and no CI check holds q47: scripts/perf/keystroke-to-preview.swift
// does, in a WKWebView, run by scripts/perf/keystroke-to-preview-gate.sh for every new main on
// a Mac of the oldest generation macOS 14 supports (unmark-1793451427523-5-478d1806.11). On a
// 2019 i9 MacBook Pro of that generation, this test's median keystroke took 77-87 ms while the
// WKWebView's, with the 1 MB of text passed through callAsyncJavaScript and the frame painted,
// took 123-161 ms: 1.5-2x (unmark-1793451427523-5-478d1806.8). Holding this test to q47 by that
// ratio, about 115 ms, would fail CI's runner with no regression: its medians here range
// 111-237 ms between runs.
// So the median's budget is a coarse guard, and the sharper check is the first keystroke's.

import { beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";

// Above the slowest median CI's runner has shown (237 ms) and about 3.5 times the i9's, so it
// catches only a renderer doing several times the work per keystroke.
const MEDIAN_KEYSTROKE_BUDGET_MS = 300;
const KEYSTROKES = 7;
// Every top-level block's height in the layout model below.
const BLOCK_HEIGHT = 100;

const section = (n: number) => `## Part ${n}

Text with a [link](https://example.com/${n}), www.example.com, and more words here.

| a | b |
| :-- | --: |
| ${n} | x |

- [x] done
- [ ] not done

\`\`\`js
const n = ${n};
\`\`\`

> [!NOTE]
> An alert.

Another paragraph ${n} with **bold** and _emphasis_ and \`code\`.
`;

/** Sections numbered from `first` until the document is `length` characters long. */
function documentOf(length: number, first: number): string {
  let markdown = "";
  for (let n = first; markdown.length < length; n++) markdown += `${section(n)}\n`;
  return markdown;
}

let article: Element;
let scrollY = 0;

// jsdom lays nothing out, so each top-level block gets a fixed height, as the bead's
// measurement did: the first screen then ends where it would on screen. The positions are
// recomputed only after the article's children change, so the model itself stays cheap.
const indexOfBlock = new Map<Element, number>();
let layoutStale = true;
const layoutChanges = new MutationObserver(() => {
  layoutStale = true;
});

function blockIndex(block: Element): number {
  if (layoutChanges.takeRecords().length > 0) layoutStale = true;
  if (layoutStale) {
    indexOfBlock.clear();
    let index = 0;
    for (let child = article.firstElementChild; child; child = child.nextElementSibling) {
      indexOfBlock.set(child, index++);
    }
    layoutStale = false;
  }
  return indexOfBlock.get(block) ?? indexOfBlock.size;
}

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
  layoutChanges.observe(article, { childList: true });
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(window, "scrollBy").mockImplementation(((_x: number, y: number) => {
    scrollY = Math.max(0, scrollY + y);
  }) as typeof window.scrollBy);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this === article) {
      return new DOMRect(0, -scrollY, 100, blockIndex(article) * BLOCK_HEIGHT);
    }
    let block: Element | null = this;
    while (block && block.parentElement !== article) block = block.parentElement;
    const top = (block ? blockIndex(block) : 0) * BLOCK_HEIGHT;
    return new DOMRect(0, top - scrollY, 100, BLOCK_HEIGHT);
  });
});

/**
 * Opens `markdown`, waits for all of it to be on the page, as after the reader has had it open
 * a moment, and types `x` after `edited` with it on screen. Returns each keystroke's time to the
 * render's first screen.
 */
async function openAndType(
  markdown: string,
  edited: string,
  keystrokes: number,
): Promise<number[]> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///" });
  await window.unmark.outline();
  const paragraph = [...article.children].find((block) => block.textContent?.startsWith(edited));
  expect(paragraph).toBeDefined();
  scrollY = blockIndex(paragraph as Element) * BLOCK_HEIGHT - 300;

  let text = markdown;
  const caret = text.indexOf(edited) + edited.length;
  const durations: number[] = [];
  for (let typed = 0; typed < keystrokes; typed++) {
    text = `${text.slice(0, caret + typed)}x${text.slice(caret + typed)}`;
    const start = performance.now();
    await window.unmark.render(text, { documentBaseURL: "file:///" });
    durations.push(performance.now() - start);
  }
  const typedIn = `${edited}${"x".repeat(keystrokes)} with`;
  expect([...article.children].some((block) => block.textContent?.startsWith(typedIn))).toBe(true);
  return durations;
}

test("typing in a 1 MB document shows each edit's first screen without redoing the page", async () => {
  // The first edit runs the edit path's code for the first time, and V8 compiling it added up
  // to 130 ms to that keystroke, on CI's runner and a 2019 i9 MacBook Pro alike, against the
  // renderer's own 150-200 ms per keystroke on both (unmark-1793451427523-5-478d1806.7). So a
  // small document takes the first edits, its sections numbered apart from the measured one's
  // so the two share no heading, paragraph, table, or code block.
  await openAndType(documentOf(50_000, 100_000), "Another paragraph 100100", 3);

  const opened = documentOf(1_000_000, 0);
  expect(opened.length).toBeGreaterThanOrEqual(1_000_000);
  const durations = await openAndType(opened, "Another paragraph 1200", KEYSTROKES);
  const measured = `keystroke to first screen: ${durations.map(Math.round).join(", ")} ms`;
  const [first = 0] = durations;
  const median = [...durations].sort((a, b) => a - b)[Math.floor(KEYSTROKES / 2)] ?? 0;
  // The median, so a garbage collection landing on one keystroke doesn't fail the test; a
  // renderer doing more per keystroke slows them all. vitest.config.ts runs this file after the
  // others, so their work doesn't land on the keystrokes too (unmark-t5a).
  expect(median, measured).toBeLessThan(MEDIAN_KEYSTROKE_BUDGET_MS);
  // The first keystroke after the document finished rendering is the one that would read the
  // whole page's source-line markers if they weren't read as they landed: about three times
  // the others' time (unmark-1793451427066-4-97884ee7.10).
  expect(first, measured).toBeLessThan(2 * median);
}, 120_000);
