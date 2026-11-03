// @vitest-environment jsdom

// The Preview's half of the Outline (unmark-1793451438713-29-a6ce6672). jsdom has no layout, so
// top-level blocks are stacked from a list of heights and the window scroll is simulated, as in
// scroll-sync.test.ts.

import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import "../src/index.ts";

const DOCUMENT = "# A\n\nText.\n\n## B\n\nText.\n\n## C\n\nText.";
// Top of each block: h1 0, p 100, h2 200, p 300, h2 600, p 700; the article ends at 800.
const HEIGHTS = [100, 100, 100, 300, 100, 100];

let article: Element;
let scrollY = 0;
let frames: FrameRequestCallback[] = [];
const postMessage = vi.fn();

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
  window.webkit = { messageHandlers: { unmark: { postMessage } } };
});

beforeEach(async () => {
  // An edit's render waits for a pause in the typing before it finishes.
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(window, "scrollBy").mockImplementation(((_x: number, y: number) => {
    scrollTo(scrollY + y);
  }) as typeof window.scrollBy);
  // jsdom doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = function (this: Element) {
    scrollTo(this.getBoundingClientRect().top + scrollY);
  };
  // Elements other than top-level blocks have no box, like those in a closed <details>.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    let top = -scrollY;
    for (const [index, block] of [...article.children].entries()) {
      const height = HEIGHTS[index] ?? 100;
      if (block === this) return new DOMRect(0, top, 100, height);
      top += height;
    }
    return new DOMRect();
  });
  await renderSettled(DOCUMENT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Renders `markdown` and lets its background work finish. */
async function renderAll(markdown: string): Promise<void> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
  const outline = window.unmark.outline();
  await vi.runAllTimersAsync();
  await outline;
}

/** Renders `markdown` and settles the page at its top, with no reports counted yet. */
async function renderSettled(markdown: string): Promise<void> {
  await renderAll(markdown);
  scrollTo(0);
  runFrames();
  postMessage.mockReset();
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

function messagesOfType(type: string): unknown[] {
  return postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === type);
}

test("the current heading changes as each heading passes the viewport's top", () => {
  for (const y of [150, 200, 599, 600, 800, 250, 0]) {
    scrollTo(y);
    runFrames();
  }
  expect(messagesOfType("currentHeading")).toEqual([
    { type: "currentHeading", id: "b" },
    { type: "currentHeading", id: "c" },
    { type: "currentHeading", id: "b" },
    { type: "currentHeading", id: "a" },
  ]);
});

test("a heading scrolled to is current", async () => {
  await window.unmark.scrollToElement("c");
  runFrames();
  expect(messagesOfType("currentHeading")).toEqual([{ type: "currentHeading", id: "c" }]);
});

// DOMPurify used to drop an id naming a document or form property, so these headings had no
// element to scroll to and were never current (unmark-1793451427523-5-478d1806.1).
test("headings named after document and form properties can be scrolled to and are current", async () => {
  const ids = ["title", "links", "images", "forms", "hidden", "after"];
  await renderSettled(ids.map((id) => `## ${id}`).join("\n\n"));
  // Bottom up, so every scroll moves the page and changes the current heading.
  for (const [index, id] of [...ids.entries()].reverse()) {
    await window.unmark.scrollToElement(id);
    runFrames();
    expect(article.children[index]?.getBoundingClientRect().top, id).toBeCloseTo(0);
  }
  expect(messagesOfType("currentHeading")).toEqual(
    ids.toReversed().map((id) => ({ type: "currentHeading", id })),
  );
});

test("above the first heading there is no current heading", async () => {
  await renderSettled("Intro.\n\n# A\n\nText.");
  scrollTo(150);
  runFrames();
  scrollTo(50);
  runFrames();
  expect(messagesOfType("currentHeading")).toEqual([
    { type: "currentHeading", id: "a" },
    { type: "currentHeading", id: null },
  ]);
});

test("an edit that renames the current heading reports its new id without a scroll", async () => {
  scrollTo(250);
  runFrames();
  postMessage.mockReset();
  await renderAll(DOCUMENT.replace("## B", "## Bee"));
  runFrames();
  expect(messagesOfType("currentHeading")).toEqual([{ type: "currentHeading", id: "bee" }]);
});

test("a heading in a closed <details> is never current", async () => {
  await renderSettled(
    "Intro.\n\n<details><summary>More</summary>\n\n## Folded\n\n</details>\n\n## Later",
  );
  for (const y of [200, 150]) {
    scrollTo(y);
    runFrames();
  }
  expect(messagesOfType("currentHeading")).toEqual([
    { type: "currentHeading", id: "later" },
    { type: "currentHeading", id: null },
  ]);
});

test("each finished render posts the whole outline", async () => {
  await renderAll("# One\n\n## Two");
  expect(messagesOfType("outline")).toEqual([
    {
      type: "outline",
      headings: [
        { level: 1, text: "One", id: "one" },
        { level: 2, text: "Two", id: "two" },
      ],
    },
  ]);
});
