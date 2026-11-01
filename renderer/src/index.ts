import { type Block, blockCache, htmlBlocks, Rendering, spliceBlocks } from "./chunks.ts";
import type { Heading, RenderEnv } from "./headings.ts";
import { createMarkdown } from "./markdown.ts";
import { BlockMerge } from "./merge.ts";
import { captureScrollAnchor, restoreScrollAnchor, type ScrollAnchor } from "./scroll-anchor.ts";
import {
  keepLineAcrossWidthChanges,
  markOwnScroll,
  reportScrolls,
  SourceLineMap,
} from "./scroll-sync.ts";
import { reportTaskToggles } from "./task-toggle.ts";

export type { Heading };

export interface RenderOptions {
  /** URL of the document's directory; relative links and images resolve against it. */
  documentBaseURL: string;
}

/**
 * `screen` follows the system appearance (q8). `print` is what goes on paper (#34, q61):
 * GitHub's light theme in either appearance, without UI-only affordances.
 */
export type OutputMode = "screen" | "print";

export interface UnmarkRenderer {
  /**
   * Resolves once the part of the document that fills the viewport is on the page; the rest
   * is parsed and inserted in background tasks (q47). A later call stops an earlier one's
   * background work.
   */
  render(markdown: string, opts: RenderOptions): Promise<void>;
  /** The rendered document's headings, in document order, once all of it is parsed. */
  outline(): Promise<Heading[]>;
  /** Scrolls the element with `id` into view, rendering the document up to it first if needed. */
  scrollToElement(id: string): Promise<void>;
  /**
   * Scrolls the block that starts on 0-based source `line` to the viewport's top, rendering
   * the document up to it first if needed. A fractional line lands between the blocks around
   * it, in proportion. Split mode calls it as the Source scrolls; the page posts
   * `{ type: "previewScrolled", line }` to the app's `unmark` message handler as it scrolls.
   */
  scrollToSourceLine(line: number): Promise<void>;
  /**
   * The 0-based source line at the viewport's top, fractional between the blocks around it.
   * Split mode starts the Source on it when it shows the Source.
   */
  lineAtTop(): number;
  /**
   * Switches the page's styling and diagrams to `mode`. `print` resolves once the whole
   * document is on the page in the light theme, so a print operation started then captures
   * all of it.
   */
  setOutputMode(mode: OutputMode): Promise<void>;
}

declare global {
  interface Window {
    unmark: UnmarkRenderer;
  }
}

// HTML characters per chunk while filling the first screen: small, because everything
// sanitized and laid out before the viewport is full delays the open (q47). 4 KB opened a
// 1 MB document about 0.1 s sooner than 8 KB, and 2 KB no sooner than 4 KB.
const FIRST_SCREEN_CHUNK = 4 * 1024;
// Larger chunks after that, so per-chunk overhead stays small across a long document.
const BACKGROUND_CHUNK = 32 * 1024;
// How long each background task renders pieces before yielding, so scrolling and input stay
// responsive while a long document finishes rendering.
const BACKGROUND_TASK_MS = 30;

const md = createMarkdown();
let latestRender = 0;
let outputMode: OutputMode = "screen";
/**
 * The document on the page: its outline so far, its line count, its pieces, the merge putting
 * them on the page, and when that merge's background work settles.
 */
let rendered: {
  headings: Heading[];
  lineCount: number;
  rendering?: Rendering;
  merge?: BlockMerge;
  background: Promise<void>;
} = {
  headings: [],
  lineCount: 0,
  background: Promise.resolve(),
};

async function render(markdown: string, { documentBaseURL }: RenderOptions): Promise<void> {
  const article = document.querySelector("article.markdown-body");
  if (!article) throw new Error('index.html has no <article class="markdown-body">');
  const renderId = ++latestRender;
  const isCurrent = () => renderId === latestRender;

  // Set before inserting content so relative <img> URLs resolve against the document,
  // not the renderer bundle (#22).
  setDocumentBase(documentBaseURL);
  const env: RenderEnv = { headings: [] };
  // An edit block-parses and renders only what it may have changed when it can, and otherwise
  // the whole document, reusing the rendering of every piece the render before it rendered or
  // the page shows. Either way the merge keeps the DOM of the pieces that render the same
  // (unmark-1793451427066-4-97884ee7.1).
  const onPage = rendered.merge?.onPage() ?? [];
  const previous = rendered.rendering;
  const spliced = previous && spliceBlocks(md, markdown, env, previous);
  const rendering = spliced ?? new Rendering();
  const rest = spliced
    ? undefined
    : htmlBlocks(
        md,
        markdown,
        env,
        blockCache([...(previous?.blocks ?? []), ...onPage.map(({ block }) => block)]),
        rendering,
      );
  const merge = new BlockMerge(article, onPage, piecesOf(rendering, rest), isCurrent, drawDiagrams);
  // Captured before the merge changes the page, so a reload keeps the reader's place (#24).
  const anchor = captureScrollAnchor(article);
  const firstScreen = showFirstScreen(article, merge, anchor, isCurrent);
  // markdown-it splits lines at the same breaks.
  const lineCount = (markdown.match(/\r\n?|\n/g)?.length ?? 0) + 1;
  // Set before the merge's first step, so a render that starts meanwhile merges from this one.
  rendered = {
    headings: env.headings,
    lineCount,
    rendering,
    merge,
    // A render that failed has nothing left to do in the background; its caller gets the error.
    background: firstScreen.then(
      async () => {
        // An open builds the DOM as it renders, so a reader scrolling down soon sees more. An
        // edit renders the rest first, so the next keystroke can splice into it sooner.
        if (!previous) {
          await Promise.all([
            mergeInBackground(merge),
            rest && renderInBackground(rest, isCurrent),
          ]);
          return;
        }
        if (rest) await renderInBackground(rest, isCurrent);
        await mergeInBackground(merge);
      },
      () => {},
    ),
  };
  await firstScreen;
  // An edit above the top changes the line there even when the page doesn't scroll.
  rememberLineAtTop();
}

/** The rendering's pieces in order, rendering more of them from `rest` as they're needed. */
function* piecesOf(rendering: Rendering, rest: Iterator<Block> | undefined): Generator<Block> {
  for (let index = 0; ; index++) {
    while (index >= rendering.blocks.length) {
      if (!rest || rest.next().done) return;
    }
    yield rendering.blocks[index] as Block;
  }
}

/**
 * Renders the rest of the document ahead of the merge, which also builds and lays out each
 * piece's DOM, so the next edit can splice into this rendering (chunks.ts). With keystrokes a
 * second apart soon after a 1 MB document opens, each render would otherwise be replaced
 * before its last piece rendered, and the next one render the whole document again.
 */
async function renderInBackground(rest: Iterator<Block>, isCurrent: () => boolean): Promise<void> {
  for (let done = false; !done && isCurrent(); ) {
    await new Promise((resolve) => setTimeout(resolve));
    const deadline = performance.now() + BACKGROUND_TASK_MS;
    while (!done && performance.now() < deadline) done = rest.next().done ?? true;
  }
}

/**
 * Merges until the pieces in the viewport are the new render's, so the Preview reports the
 * render with the viewport complete (open-to-preview and keystroke-to-preview, q47), and keeps
 * the reader's place. Each check lays out only what changed.
 */
async function showFirstScreen(
  article: Element,
  merge: BlockMerge,
  anchor: ScrollAnchor | null,
  isCurrent: () => boolean,
): Promise<void> {
  do {
    await merge.advanceUntil(() => merge.coversViewport(), FIRST_SCREEN_CHUNK);
    if (!isCurrent()) return;
    // After the diagrams the merge drew, whose height the anchor was captured with. Bringing the
    // anchor's block back may bring old pieces into view, which the next pass merges.
    if (anchor) {
      restoreScrollAnchor(article, anchor);
      markOwnScroll();
    }
  } while (!merge.done && !merge.coversViewport());
}

/** Waits for the background work of the document on the page, even if a render replaces it. */
async function whenRendered(): Promise<void> {
  for (let current = rendered; ; current = rendered) {
    await current.background;
    if (current === rendered) return;
  }
}

async function outline(): Promise<Heading[]> {
  await whenRendered();
  return rendered.headings;
}

/**
 * Merges a step per task. Each task's new DOM is laid out before the next task runs, keystrokes
 * included: with several steps per task, a keystroke soon after a 1 MB document opened waited up
 * to 300 ms for that layout (unmark-1793451427066-4-97884ee7.1).
 */
async function mergeInBackground(merge: BlockMerge): Promise<void> {
  while (!merge.done) {
    await new Promise((resolve) => setTimeout(resolve));
    let steps = 0;
    await merge.advanceUntil(() => steps++ > 0, BACKGROUND_CHUNK);
  }
}

// Drawn in the DOM because Mermaid measures text as it lays out (#19). The merge calls this only
// for new diagram containers, so documents without diagrams never load Mermaid's chunk.
async function drawDiagrams(containers: Element[]): Promise<void> {
  const { renderDiagrams } = await import("./diagrams.ts");
  await renderDiagrams(containers, outputMode);
}

async function setOutputMode(mode: OutputMode): Promise<void> {
  outputMode = mode;
  // print.css keys the light canvas and hidden heading link icons off this attribute.
  document.documentElement.dataset.outputMode = mode;
  // Swapping `media` rather than `disabled`: WebKit fetches a stylesheet whose media doesn't
  // match at page load, so the print theme is ready before the first print.
  for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-output-mode]")) {
    link.media = link.dataset.outputMode === mode ? "all" : "not all";
  }
  const article = document.querySelector("article.markdown-body");
  if (!article) return;
  // Printing captures only what's on the page, so the background chunks must land first.
  if (mode === "print") await whenRendered();
  // Redraws the diagrams already on the page, unlike drawDiagrams, which draws new ones.
  if (outputMode !== mode || !article.querySelector(".mermaid-diagram")) return;
  // Dynamic, like drawDiagrams: Mermaid stays a lazy chunk for documents without diagrams.
  const { renderDiagrams } = await import("./diagrams.ts");
  await renderDiagrams([], mode);
}

async function scrollToElement(id: string): Promise<void> {
  // Merges pieces only up to the target rather than waiting for the background tasks to
  // reach it, so an anchor to a late heading doesn't wait for the whole document
  // (unmark-1793451426597-3-58814491.9). An old piece the merge hasn't reached yet may have
  // the id too; a merged one comes first in the document, so getElementById finds it first.
  const merge = rendered.merge;
  await merge?.advanceUntil(() => {
    const target = document.getElementById(id);
    return target !== null && merge.isMerged(target);
  }, BACKGROUND_CHUNK);
  document.getElementById(id)?.scrollIntoView();
}

async function scrollToSourceLine(line: number): Promise<void> {
  await scrollLineToTop(line);
  // So following the Source isn't reported back to it as the reader's own scroll.
  markOwnScroll();
}

async function scrollLineToTop(line: number): Promise<void> {
  const article = document.querySelector("article.markdown-body");
  if (!article) return;
  // Like scrollToElement, merges only until a piece after the line is on the page, so
  // following the Source to a late line doesn't wait for the whole document.
  const merge = rendered.merge;
  await merge?.advanceUntil(() => merge.mergedLine > line, BACKGROUND_CHUNK);
  window.scrollBy(0, sourceLineMap(article).offsetOf(line));
}

function lineAtTop(): number {
  const article = document.querySelector("article.markdown-body");
  return article ? sourceLineMap(article).lineAtTop() : 0;
}

/** The line map of the document on the page; it ends at the document's end once that's on the page. */
function sourceLineMap(article: Element): SourceLineMap {
  const complete = rendered.merge?.done ?? true;
  return new SourceLineMap(article, complete ? rendered.lineCount : undefined);
}

function setDocumentBase(href: string): void {
  let base = document.head.querySelector("base");
  if (!base) {
    base = document.createElement("base");
    document.head.prepend(base);
  }
  base.href = href;
}

window.unmark = { render, outline, scrollToElement, scrollToSourceLine, lineAtTop, setOutputMode };

reportScrolls(lineAtTop);
const rememberLineAtTop = keepLineAcrossWidthChanges(lineAtTop, scrollLineToTop);

reportTaskToggles();
