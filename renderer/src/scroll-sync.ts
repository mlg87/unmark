// The Preview's half of Split mode's scroll sync (unmark-1793451437275-26-1e1952b0, q16):
// mapping between source lines and positions on the page through the blocks' source-line
// markers (source-lines.ts), and telling the app where the reader scrolled. The app keeps the
// Source on the same line and owns the feedback-loop guard between the two panes.

import { SOURCE_LINE } from "./source-lines.ts";

declare global {
  interface Window {
    /** WebKit's bridge to the app's WKScriptMessageHandlers; absent outside the app. */
    webkit?: { messageHandlers?: { unmark?: { postMessage(message: PreviewMessage): void } } };
  }
}

/**
 * What the Preview tells the app. `previewScrolled`'s `line` is the 0-based source line at the
 * viewport's top; task-toggle.ts posts `taskToggled`.
 */
export type PreviewMessage =
  | { type: "previewScrolled"; line: number }
  | { type: "taskToggled"; line: number; checked: boolean };

interface Marker {
  line: number;
  element: Element;
}

/**
 * Where a source line and a position on the page coincide: the page's top for line 0, each
 * marked block's top edge, and, once the whole document is on the page, the article's bottom
 * edge for the line after the last. Lines and positions between two points are interpolated
 * linearly, so both directions of the mapping agree and syncing one pane from the other moves
 * neither back.
 */
export class SourceLineMap {
  readonly #article: Element;
  readonly #markers: Marker[];
  readonly #endLine: number | undefined;

  /** `endLine` is the document's line count, or `undefined` while chunks are still pending. */
  constructor(article: Element, endLine: number | undefined) {
    this.#article = article;
    this.#markers = markersOf(article);
    const lastLine = this.#markers.at(-1)?.line ?? 0;
    this.#endLine = endLine === undefined ? undefined : Math.max(endLine, lastLine);
  }

  /** The last marked line on the page, or -1 when no block is marked. */
  get lastMarkedLine(): number {
    return this.#markers.at(-1)?.line ?? -1;
  }

  /** How far `line` is below the viewport's top edge, in CSS pixels; negative when above it. */
  offsetOf(line: number): number {
    const count = this.#count;
    // The first point at or past `line`. Of points on the same line, the first is the top-most.
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.#lineAt(middle) < line) low = middle + 1;
      else high = middle;
    }
    if (low === count) return this.#topAt(count - 1);
    const at = this.#lineAt(low);
    if (low === 0 || at === line) return this.#topAt(low);
    const before = low - 1;
    const beforeLine = this.#lineAt(before);
    const beforeTop = this.#topAt(before);
    return beforeTop + ((line - beforeLine) / (at - beforeLine)) * (this.#topAt(low) - beforeTop);
  }

  /** The source line at the viewport's top edge, fractional between two points. */
  lineAtTop(): number {
    const count = this.#count;
    // The last point at or above the viewport's top edge. The page's top always is.
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.#topAt(middle) <= 0) low = middle;
      else high = middle - 1;
    }
    const beforeLine = this.#lineAt(low);
    if (low === count - 1) return beforeLine;
    const beforeTop = this.#topAt(low);
    const afterTop = this.#topAt(low + 1);
    // Only when the layout puts a later block above an earlier one, as floats can.
    if (afterTop <= beforeTop) return beforeLine;
    return (
      beforeLine + (-beforeTop / (afterTop - beforeTop)) * (this.#lineAt(low + 1) - beforeLine)
    );
  }

  get #count(): number {
    return this.#markers.length + (this.#endLine === undefined ? 1 : 2);
  }

  #lineAt(index: number): number {
    if (index === 0) return 0;
    return this.#markers[index - 1]?.line ?? (this.#endLine as number);
  }

  /** The point's position relative to the viewport's top edge. */
  #topAt(index: number): number {
    if (index === 0) return -window.scrollY;
    const marker = this.#markers[index - 1];
    if (marker) return marker.element.getBoundingClientRect().top;
    return this.#article.getBoundingClientRect().bottom;
  }
}

let cached: { article: Element; markers: Marker[] } | undefined;
// Every insertion, diagram drawn, and <details> opened or closed moves or hides blocks, and an
// edit above a block the Preview keeps moves its markers.
const changes = new MutationObserver(() => {
  cached = undefined;
});

/**
 * The marked blocks under `article` that the reader can see, in document order, with lines
 * that only increase: of blocks on the same line, the outermost; and none whose line comes
 * before an earlier block's, such as a footnote rendered at the end but defined at the top.
 * Cached until the article changes, since the sync reads it on every scrolled frame.
 */
function markersOf(article: Element): Marker[] {
  if (changes.takeRecords().length > 0) cached = undefined;
  if (cached?.article === article) return cached.markers;

  const hasClosedDetails = article.querySelector("details:not([open])") !== null;
  const markers: Marker[] = [];
  let lastLine = -1;
  for (const element of article.querySelectorAll(`[${SOURCE_LINE}]`)) {
    const line = Number(element.getAttribute(SOURCE_LINE));
    if (!(line > lastLine)) continue;
    // Blocks in a closed <details> have no box, so they have no position to sync to.
    if (hasClosedDetails && element.closest("details:not([open])")) continue;
    markers.push({ line, element });
    lastLine = line;
  }

  changes.disconnect();
  changes.observe(article, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", SOURCE_LINE],
  });
  cached = { article, markers };
  return markers;
}

/** The scroll position the renderer last scrolled to itself, so the scroll isn't reported. */
let ownScrollY: number | undefined;

/**
 * Records a scroll the renderer made, such as following the Source or keeping the reader's
 * place across a reload, so it isn't reported back to the app as the reader's.
 */
export function markOwnScroll(): void {
  ownScrollY = window.scrollY;
}

/**
 * Posts a `previewScrolled` message with `lineAtTop()` to the app at most once per animation
 * frame while the reader scrolls the page.
 */
export function reportScrolls(lineAtTop: () => number): void {
  let frameRequested = false;
  const report = () => {
    frameRequested = false;
    const handler = window.webkit?.messageHandlers?.unmark;
    if (!handler) return;
    if (window.scrollY === ownScrollY) return;
    ownScrollY = undefined;
    handler.postMessage({ type: "previewScrolled", line: lineAtTop() });
  };
  window.addEventListener(
    "scroll",
    () => {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(report);
    },
    { passive: true },
  );
}
