import { htmlBlocks } from "./chunks.ts";
import type { Heading, RenderEnv } from "./headings.ts";
import { createMarkdown } from "./markdown.ts";
import { sanitize } from "./sanitize.ts";
import { captureScrollAnchor, restoreScrollAnchor } from "./scroll-anchor.ts";

export type { Heading };

export interface RenderOptions {
  /** URL of the document's directory; relative links and images resolve against it. */
  documentBaseURL: string;
}

export interface RenderResult {
  headings: Heading[];
}

export interface UnmarkRenderer {
  /**
   * Resolves once the part of the document that fills the viewport is on the page; the rest
   * follows in background tasks (q47). A later call stops an earlier one's background work.
   */
  render(markdown: string, opts: RenderOptions): Promise<RenderResult>;
  /** Scrolls the element with `id` into view, once the background tasks have inserted it. */
  scrollToElement(id: string): Promise<void>;
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
// How long each background task inserts chunks before yielding, so scrolling and input
// stay responsive while a long document finishes rendering.
const BACKGROUND_TASK_MS = 30;

const md = createMarkdown();
let latestRender = 0;
/** Settles when the latest render has inserted every block, or a newer render stopped it. */
let backgroundAppend: Promise<void> = Promise.resolve();

async function render(markdown: string, { documentBaseURL }: RenderOptions): Promise<RenderResult> {
  const article = document.querySelector("article.markdown-body");
  if (!article) throw new Error('index.html has no <article class="markdown-body">');
  const renderId = ++latestRender;
  const isCurrent = () => renderId === latestRender;

  // Set before inserting content so relative <img> URLs resolve against the document,
  // not the renderer bundle (#22).
  setDocumentBase(documentBaseURL);
  const env: RenderEnv = { headings: [] };
  // The whole document is parsed up front: reference links, footnotes, and the outline
  // depend on all of it. Only sanitizing, inserting, and laying out are incremental.
  const chunks = new Fragments(htmlBlocks(md, md.parse(markdown, env), env));
  const result = { headings: env.headings };

  const content = (await chunks.next(FIRST_SCREEN_CHUNK)) ?? document.createDocumentFragment();
  for (;;) {
    if (!isCurrent()) return result;
    // Captured right before the swap, so a reload keeps the reader's place (#24).
    const anchor = captureScrollAnchor(article);
    if (!anchor || chunks.done) {
      article.replaceChildren(content);
      await drawDiagrams(article);
      // After the diagrams, whose height and text the anchor was captured with. A reload
      // that swapped in newer content while they drew restores its own anchor.
      if (anchor && isCurrent()) restoreScrollAnchor(article, anchor);
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
    if (!isCurrent()) return result;
    if (next) article.append(next);
    await drawDiagrams(article);
  }
  backgroundAppend = chunks.done
    ? Promise.resolve()
    : appendInBackground(article, chunks, isCurrent);
  return result;
}

async function appendInBackground(
  article: Element,
  chunks: Fragments,
  isCurrent: () => boolean,
): Promise<void> {
  while (!chunks.done) {
    await new Promise((resolve) => setTimeout(resolve));
    if (!isCurrent()) return;
    const batch = document.createDocumentFragment();
    const deadline = performance.now() + BACKGROUND_TASK_MS;
    while (!chunks.done && performance.now() < deadline) {
      const next = await chunks.next(BACKGROUND_CHUNK);
      if (next) batch.append(next);
    }
    // A newer render may have started while KaTeX loaded.
    if (!isCurrent()) return;
    article.append(batch);
    await drawDiagrams(article);
  }
}

// Drawn in the DOM because Mermaid measures text as it lays out (#19). The import stays
// behind this check so documents without diagrams never load Mermaid's chunk. Drawing
// replaces each `pre[data-mermaid]`, so a call draws only blocks inserted since the last.
async function drawDiagrams(article: Element): Promise<void> {
  if (!article.querySelector("pre[data-mermaid]")) return;
  const { renderDiagrams } = await import("./diagrams.ts");
  await renderDiagrams(article);
}

async function scrollToElement(id: string): Promise<void> {
  if (!document.getElementById(id)) await backgroundAppend;
  document.getElementById(id)?.scrollIntoView();
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

window.unmark = { render, scrollToElement };
