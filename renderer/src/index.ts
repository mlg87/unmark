import { htmlBlocks } from "./chunks.ts";
import type { Heading, RenderEnv } from "./headings.ts";
import { createMarkdown } from "./markdown.ts";
import { sanitize } from "./sanitize.ts";
import { captureScrollAnchor, restoreScrollAnchor } from "./scroll-anchor.ts";
import { markOwnScroll, reportScrolls, SourceLineMap } from "./scroll-sync.ts";
import { SOURCE_LINE } from "./source-lines.ts";
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
// How long each background task parses and inserts chunks before yielding, so scrolling
// and input stay responsive while a long document finishes rendering.
const BACKGROUND_TASK_MS = 30;

const md = createMarkdown();
let latestRender = 0;
let outputMode: OutputMode = "screen";
/**
 * The document on the page: its outline so far, its line count, the chunks not yet appended,
 * and when its background work settles.
 */
let rendered: {
  headings: Heading[];
  lineCount: number;
  pending?: PendingChunks;
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
  const chunks = new Fragments(htmlBlocks(md, markdown, env));

  const content = (await chunks.next(FIRST_SCREEN_CHUNK)) ?? document.createDocumentFragment();
  for (;;) {
    if (!isCurrent()) return;
    // Captured right before the swap, so a reload keeps the reader's place (#24).
    const anchor = captureScrollAnchor(article);
    if (!anchor || chunks.done) {
      article.replaceChildren(content);
      await drawDiagrams(article);
      // After the diagrams, whose height and text the anchor was captured with. A reload
      // that swapped in newer content while they drew restores its own anchor.
      if (anchor && isCurrent()) {
        restoreScrollAnchor(article, anchor);
        markOwnScroll();
      }
      break;
    }
    // The anchor's block may be anywhere in the new content, so a reload while scrolled
    // renders everything before the swap. The loop captures the anchor again after the await.
    const rest = await chunks.next(Number.POSITIVE_INFINITY);
    if (rest) content.append(rest);
  }

  // Fills the viewport before resolving, so the first screen is complete when the Preview
  // reports the render (open-to-preview, q47). Each check lays out only what's inserted.
  while (!chunks.done && article.getBoundingClientRect().bottom < window.innerHeight) {
    const next = await chunks.next(FIRST_SCREEN_CHUNK);
    if (!isCurrent()) return;
    if (next) article.append(next);
    await drawDiagrams(article);
  }
  const pending = new PendingChunks(article, chunks, isCurrent);
  // markdown-it splits lines at the same breaks.
  const lineCount = (markdown.match(/\r\n?|\n/g)?.length ?? 0) + 1;
  rendered = {
    headings: env.headings,
    lineCount,
    pending,
    background: appendInBackground(pending),
  };
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

async function appendInBackground(pending: PendingChunks): Promise<void> {
  while (!pending.done) {
    await new Promise((resolve) => setTimeout(resolve));
    const deadline = performance.now() + BACKGROUND_TASK_MS;
    await pending.appendUntil(() => performance.now() >= deadline);
  }
}

// Drawn in the DOM because Mermaid measures text as it lays out (#19). The import stays
// behind this check so documents without diagrams never load Mermaid's chunk. Drawing
// replaces each `pre[data-mermaid]`, so a call draws only blocks inserted since the last.
async function drawDiagrams(article: Element): Promise<void> {
  if (!article.querySelector("pre[data-mermaid]")) return;
  const { renderDiagrams } = await import("./diagrams.ts");
  await renderDiagrams(article, outputMode);
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
  // Redraws the diagrams already drawn, unlike drawDiagrams, which draws only new blocks.
  if (outputMode !== mode || !article.querySelector(".mermaid-diagram, pre[data-mermaid]")) return;
  // Dynamic, like drawDiagrams: Mermaid stays a lazy chunk for documents without diagrams.
  const { renderDiagrams } = await import("./diagrams.ts");
  await renderDiagrams(article, mode);
}

async function scrollToElement(id: string): Promise<void> {
  // Pulls chunks only up to the target rather than waiting for the background tasks to
  // reach it, so an anchor to a late heading doesn't wait for the whole document
  // (unmark-1793451426597-3-58814491.9).
  // Checks the page too: an append queued before this call's turn may bring the element in.
  if (!document.getElementById(id)) {
    await rendered.pending?.appendUntil(
      (batch) => document.getElementById(id) !== null || batch.getElementById(id) !== null,
    );
  }
  document.getElementById(id)?.scrollIntoView();
}

async function scrollToSourceLine(line: number): Promise<void> {
  const article = document.querySelector("article.markdown-body");
  if (!article) return;
  // Like scrollToElement, pulls chunks only until a block after the line is on the page, so
  // following the Source to a late line doesn't wait for the whole document.
  if (!(sourceLineMap(article).lastMarkedLine > line)) {
    await rendered.pending?.appendUntil((batch) => {
      const marked = batch.querySelectorAll(`[${SOURCE_LINE}]`);
      const lastInBatch = Number(marked[marked.length - 1]?.getAttribute(SOURCE_LINE));
      return sourceLineMap(article).lastMarkedLine > line || lastInBatch > line;
    });
  }
  window.scrollBy(0, sourceLineMap(article).offsetOf(line));
  // So following the Source isn't reported back to it as the reader's own scroll.
  markOwnScroll();
}

/** The line map of the document on the page; it ends at the document's end once that's on the page. */
function sourceLineMap(article: Element): SourceLineMap {
  const complete = rendered.pending?.done ?? true;
  return new SourceLineMap(article, complete ? rendered.lineCount : undefined);
}

/**
 * A rendered document's chunks not yet on the page. The background tasks, scrollToElement,
 * and scrollToSourceLine all append them, one call at a time so the chunks land in order.
 */
class PendingChunks {
  readonly #article: Element;
  readonly #chunks: Fragments;
  readonly #isCurrent: () => boolean;
  #lastCall: Promise<void> = Promise.resolve();

  constructor(article: Element, chunks: Fragments, isCurrent: () => boolean) {
    this.#article = article;
    this.#chunks = chunks;
    this.#isCurrent = isCurrent;
  }

  /** True once every chunk is on the page, or a newer render replaced the document. */
  get done(): boolean {
    return this.#chunks.done || !this.#isCurrent();
  }

  /**
   * Appends the next chunks as one batch, pulling until `enough(batch)` holds or the
   * document ends. `enough` is asked first, when this call's turn comes, since earlier calls
   * may have appended what it needed. The pull never yields to other tasks, so callers that
   * must keep the page responsive pull in small steps.
   */
  appendUntil(enough: (batch: DocumentFragment) => boolean): Promise<void> {
    const call = this.#lastCall.then(async () => {
      if (this.done) return;
      const batch = document.createDocumentFragment();
      while (!this.#chunks.done && !enough(batch)) {
        const next = await this.#chunks.next(BACKGROUND_CHUNK);
        if (next) batch.append(next);
      }
      // A newer render may have started while KaTeX loaded.
      if (!this.#isCurrent()) return;
      this.#article.append(batch);
      await drawDiagrams(this.#article);
    });
    // A call that failed (a lazy chunk that didn't load) mustn't block the ones after it.
    this.#lastCall = call.catch(() => {});
    return call;
  }
}

/** Sanitized, ready-to-insert fragments of the document, in order. */
class Fragments {
  /** True once every block has been returned. */
  done = false;
  readonly #blocks: Iterator<string>;

  constructor(blocks: Iterator<string>) {
    this.#blocks = blocks;
  }

  /** The next blocks, at least `minLength` characters of HTML unless they're the last. */
  async next(minLength: number): Promise<DocumentFragment | undefined> {
    let html = "";
    while (html.length < minLength) {
      const block = this.#blocks.next();
      if (block.done) {
        this.done = true;
        break;
      }
      html += block.value;
    }
    if (!html) return undefined;
    // Documents are untrusted: nothing markdown-it emits reaches the DOM unsanitized (#15).
    const fragment = sanitize(html);
    // KaTeX is a lazy chunk only documents with math load (unmark-1793451433078-17-487f189f).
    // Its output is built after sanitizing, from TeX that was sanitized as text.
    if (fragment.querySelector(".math")) {
      const { renderMath } = await import("./math.ts");
      renderMath(fragment);
    }
    return fragment;
  }
}

function setDocumentBase(href: string): void {
  let base = document.head.querySelector("base");
  if (!base) {
    base = document.createElement("base");
    document.head.prepend(base);
  }
  base.href = href;
}

window.unmark = { render, outline, scrollToElement, scrollToSourceLine, setOutputMode };

reportScrolls(() => {
  const article = document.querySelector("article.markdown-body");
  return article ? sourceLineMap(article).lineAtTop() : 0;
});

reportTaskToggles();
