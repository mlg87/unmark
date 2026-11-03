// The Preview's half of the Outline's highlight (unmark-1793451438713-29-a6ce6672, q51): the
// current heading is the last heading at or above the viewport's top, and the page tells the
// app whenever that changes. The app selects that heading's row.

import { documentIdOf } from "./sanitize.ts";

// scrollIntoView puts a heading's top at the viewport's top, give or take WebKit's subpixel
// rounding, and a heading the Outline just scrolled to has to count as passed.
const TOP_SLACK_PX = 1;

const HEADINGS = "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]";
const FOOTNOTES_LABEL = "section[data-footnotes] > h2.sr-only";

/** The article's headings that have a box, in document order, cached until the article changes. */
let cached: Element[] | undefined;
let observed: Element | undefined;
const changes = new MutationObserver(() => {
  cached = undefined;
});

function headingsOf(article: Element): Element[] {
  if (article !== observed) {
    changes.disconnect();
    // Insertions, edits, and <details> opened or closed add, remove, and hide headings.
    changes.observe(article, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    observed = article;
    cached = undefined;
  }
  if (changes.takeRecords().length > 0) cached = undefined;
  // Headings in a closed <details> have no box, so they'd read as being at the viewport's top.
  // The footnotes section's screen-reader-only "Footnotes" heading (footnotes.ts) has no Outline
  // row, so reporting it would clear the Outline's highlight (unmark-1793451427523-5-478d1806.5).
  cached ??= [...article.querySelectorAll(HEADINGS)].filter(
    (heading) => !heading.closest("details:not([open])") && !heading.matches(FOOTNOTES_LABEL),
  );
  return cached;
}

/**
 * The id of the last heading at or above the viewport's top, or null above the first one.
 * Headings only move down the page in document order, so a binary search reads a handful of
 * positions per frame even in a document with thousands of headings.
 */
export function currentHeadingId(article: Element): string | null {
  const headings = headingsOf(article);
  let passed = 0;
  let notPassed = headings.length;
  while (passed < notPassed) {
    const middle = (passed + notPassed) >> 1;
    if ((headings[middle] as Element).getBoundingClientRect().top <= TOP_SLACK_PX) {
      passed = middle + 1;
    } else {
      notPassed = middle;
    }
  }
  // The outline's id, which the sanitizer's prefix isn't part of.
  return passed > 0 ? documentIdOf(headings[passed - 1] as Element) : null;
}

/**
 * Posts `{ type: "currentHeading", id }` to the app at most once per animation frame, when the
 * current heading changed: as the reader scrolls, as the renderer scrolls (an Outline click,
 * following the Source), and as renders and resizes move the headings under the viewport's top.
 */
export function reportCurrentHeading(): void {
  // Undefined until the first report, so the app learns the first current heading even if it's
  // none.
  let reported: string | null | undefined;
  let frameRequested = false;
  const report = () => {
    frameRequested = false;
    const handler = window.webkit?.messageHandlers?.unmark;
    const article = document.querySelector("article.markdown-body");
    if (!handler || !article) return;
    const id = currentHeadingId(article);
    if (id === reported) return;
    reported = id;
    handler.postMessage({ type: "currentHeading", id });
  };
  const schedule = () => {
    // Outside the app nobody listens, so the page doesn't read heading positions for nobody. The
    // handler is looked up each time because the app adds it after the page has loaded.
    if (frameRequested || !window.webkit?.messageHandlers?.unmark) return;
    frameRequested = true;
    requestAnimationFrame(report);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  // A separate observer from the cache's, whose records every read drains: this one asks for a
  // report on the next frame. The body rather than the article, which a test page adds after
  // importing the renderer; the module runs once the body is parsed.
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
}
