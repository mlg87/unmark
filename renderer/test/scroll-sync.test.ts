// @vitest-environment jsdom

// The Preview's half of Split mode's scroll sync (unmark-1793451437275-26-1e1952b0). jsdom has
// no layout, so top-level blocks are stacked from a list of heights and the window scroll is
// simulated, as in scroll-anchor.test.ts.

import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import "../src/index.ts";

// Lines 0–14. Each block is 100 px tall except the 4-line fence, at 300 px.
const DOCUMENT = [
  "# A", // 0
  "",
  "A paragraph", // 2
  "over two lines.",
  "",
  "## B", // 5
  "",
  "```js", // 7
  "a();",
  "b();",
  "```",
  "",
  "## C", // 12
  "",
  "Last paragraph.", // 14
].join("\n");
const HEIGHTS = [100, 100, 100, 300, 100, 100];
// Top of each block: h1 0, p 100, h2 200, pre 300, h2 600, p 700; the article ends at 800.
// At half this width every block is twice as tall, as wrapped text would be.
const FULL_WIDTH = 1024;

let article: Element;
let scrollY = 0;
let viewportWidth = FULL_WIDTH;
let frames: FrameRequestCallback[] = [];
const postMessage = vi.fn();

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
  window.webkit = { messageHandlers: { unmark: { postMessage } } };
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => viewportWidth });
});

beforeEach(async () => {
  scrollY = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(window, "scrollBy").mockImplementation(((_x: number, y: number) => {
    scrollTo(scrollY + y);
  }) as typeof window.scrollBy);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const stretch = FULL_WIDTH / viewportWidth;
    let top = -scrollY;
    const children = [...article.children];
    for (const [index, block] of children.entries()) {
      const height = (HEIGHTS[index] ?? 100) * stretch;
      if (block === this) return new DOMRect(0, top, 100, height);
      top += height;
    }
    if (this === article) return new DOMRect(0, -scrollY, 100, top + scrollY);
    return new DOMRect();
  });
  // Back at full width, wherever the previous test left the page.
  await resizeTo(FULL_WIDTH);
  await window.unmark.render(DOCUMENT, { documentBaseURL: "file:///docs/" });
  // Settles the previous test's frames and scroll at the top, then starts counting reports.
  scrollTo(0);
  runFrames();
  postMessage.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Changes the viewport's width and fires the resize event, then lets the page answer it. */
async function resizeTo(width: number): Promise<void> {
  viewportWidth = width;
  window.dispatchEvent(new Event("resize"));
  // The resize handler's scroll waits only on promises, which have all settled by the next task.
  await new Promise((resolve) => setTimeout(resolve));
}

/** Scrolls the page and fires the scroll event, as the reader scrolling would. */
function scrollTo(y: number): void {
  scrollY = Math.max(0, y);
  window.dispatchEvent(new Event("scroll"));
}

function runFrames(): void {
  const due = frames;
  frames = [];
  for (const frame of due) frame(performance.now());
}

function reportedLines(): number[] {
  return postMessage.mock.calls.map(([message]) => {
    expect(message.type).toBe("previewScrolled");
    return message.line;
  });
}

test.each([
  [0, 0],
  [5, 200],
  [7, 300],
  [12, 600],
])("scrolling to line %d puts the block that starts there at the top", async (line, top) => {
  await window.unmark.scrollToSourceLine(line);
  expect(scrollY).toBe(top);
});

test("a line inside a block lands in proportion between it and the next block", async () => {
  // Line 8.5 is 1.5 of the 5 lines from the fence (300 px) to heading C (600 px).
  await window.unmark.scrollToSourceLine(8.5);
  expect(scrollY).toBe(390);
});

test("lines past the last block run to the article's end", async () => {
  // The document has 15 lines; the last paragraph starts on line 14 at 700 px.
  await window.unmark.scrollToSourceLine(14.5);
  expect(scrollY).toBe(750);
});

test.each([
  [200, 5],
  [390, 8.5],
  [450, 9.5],
  [750, 14.5],
])("scrolled to %d px, the page reports line %d", (y, line) => {
  scrollTo(y);
  runFrames();
  expect(reportedLines()).toEqual([line]);
});

test("reports at most once per animation frame, with the latest position", () => {
  scrollTo(100);
  scrollTo(200);
  scrollTo(450);
  runFrames();
  expect(reportedLines()).toEqual([9.5]);
});

test("following the Source isn't reported back, but the reader's next scroll is", async () => {
  await window.unmark.scrollToSourceLine(8.5);
  runFrames();
  expect(reportedLines()).toEqual([]);

  scrollTo(450);
  runFrames();
  expect(reportedLines()).toEqual([9.5]);
});

test("a footnote rendered at the end but defined at the top doesn't send the reader to line 0", async () => {
  // Blocks: h1 (line 2) at 0 px, p (4) at 100, h2 (6) at 200, and the footnotes section from
  // 300 to the article's end at 600.
  await window.unmark.render("[^1]: A note.\n\n# A\n\nText.[^1]\n\n## B", {
    documentBaseURL: "file:///docs/",
  });
  scrollTo(350);
  runFrames();
  // Between heading B (line 6, 200 px) and the end (line 7, 600 px), not the note's line 0.
  expect(reportedLines()).toEqual([6.375]);
});

test("narrowing the page, as opening Split mode does, keeps the line at the top", async () => {
  // Line 8.5 is 390 px down at full width; Split mode inserts the Source narrow, then halves.
  scrollTo(390);
  await resizeTo(800);
  await resizeTo(FULL_WIDTH / 2);
  expect(scrollY).toBe(780);
  // So Split mode's Source follows the Preview to the line it kept.
  runFrames();
  expect(reportedLines().at(-1)).toBe(8.5);
});

test("widening the page keeps the line though the reflow scrolled it first", async () => {
  await resizeTo(FULL_WIDTH / 2);
  // Heading C, line 12, is 1200 px down at half width.
  scrollTo(1200);
  // The page got shorter, so WebKit pulls scrollY up before the resize event fires.
  viewportWidth = FULL_WIDTH;
  scrollTo(400);
  await resizeTo(FULL_WIDTH);
  expect(scrollY).toBe(600);
});
