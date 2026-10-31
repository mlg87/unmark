// @vitest-environment jsdom

// Keeping the reader's place across reloads (#24). jsdom has no layout, so blocks are stacked
// from their data-height attributes and the window scroll is simulated.

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  captureScrollAnchor,
  restoreScrollAnchor,
  type ScrollAnchor,
} from "../src/scroll-anchor.ts";

let scrollY = 0;
let article: Element;

/** Replaces the article's blocks, given as text: height entries. */
function layOut(blocks: Record<string, number>): void {
  article.replaceChildren(
    ...Object.entries(blocks).map(([text, height]) => {
      const block = document.createElement("p");
      block.dataset.height = String(height);
      block.textContent = text;
      return block;
    }),
  );
}

function capture(): ScrollAnchor {
  const anchor = captureScrollAnchor(article);
  if (!anchor) throw new Error("expected an anchor");
  return anchor;
}

/** Text of the block at the viewport's top edge, and how far into it the edge is, in pixels. */
function atViewportTop(): [string | null, number] {
  for (const block of article.children) {
    const rect = block.getBoundingClientRect();
    if (rect.bottom > 0) return [block.textContent, -rect.top];
  }
  return [null, 0];
}

beforeEach(() => {
  scrollY = 0;
  document.body.innerHTML = "<article></article>";
  article = document.querySelector("article") as Element;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(window, "scrollBy").mockImplementation(((_x: number, y: number) => {
    scrollY = Math.max(0, scrollY + y);
  }) as typeof window.scrollBy);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    let top = -scrollY;
    for (const block of article.children) {
      const height = Number((block as HTMLElement).dataset.height);
      if (block === this) return new DOMRect(0, top, 100, height);
      top += height;
    }
    return new DOMRect();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("keeps the same point of the top block when blocks above it grow", () => {
  layOut({ a: 100, b: 100, c: 200, d: 100 });
  scrollY = 250;
  const anchor = capture();
  expect(anchor.fraction).toBe(0.25);

  layOut({ a: 100, "b grew": 180, c: 200, d: 100 });
  restoreScrollAnchor(article, anchor);
  expect(atViewportTop()).toEqual(["c", 50]);
});

test("follows the top block when blocks are inserted or removed above it", () => {
  layOut({ a: 100, b: 100, c: 100, d: 100 });
  scrollY = 250;
  const anchor = capture();

  layOut({ new1: 100, a: 100, new2: 100, b: 100, c: 100, d: 100 });
  restoreScrollAnchor(article, anchor);
  expect(atViewportTop()).toEqual(["c", 50]);

  const moved = capture();
  layOut({ c: 100, d: 100 });
  restoreScrollAnchor(article, moved);
  expect(atViewportTop()).toEqual(["c", 50]);
});

test("keeps the same fraction of a block that changed height", () => {
  layOut({ a: 100, b: 200, c: 100 });
  scrollY = 150;
  const anchor = capture();

  layOut({ a: 100, b: 400, c: 100 });
  restoreScrollAnchor(article, anchor);
  expect(atViewportTop()).toEqual(["b", 100]);
});

test("uses the block at the old index when the top block's own text changed", () => {
  layOut({ a: 100, b: 100, c: 100 });
  scrollY = 150;
  const anchor = capture();

  layOut({ a: 100, "b edited": 100, c: 100 });
  restoreScrollAnchor(article, anchor);
  expect(atViewportTop()).toEqual(["b edited", 50]);
});

test("falls back to the last block when the document got shorter than the anchor", () => {
  layOut({ a: 100, b: 100, c: 100, d: 100 });
  scrollY = 350;
  const anchor = capture();

  layOut({ x: 100, y: 100 });
  restoreScrollAnchor(article, anchor);
  expect(atViewportTop()).toEqual(["y", 50]);
});

test("anchors to the next block when a block's bottom edge is exactly at the viewport top", () => {
  layOut({ a: 100, b: 100, c: 100 });
  scrollY = 100;
  expect(capture().text).toBe("b");
});

test("leaves an unscrolled page at the top", () => {
  layOut({ a: 100, b: 100 });
  expect(captureScrollAnchor(article)).toBeNull();
});
