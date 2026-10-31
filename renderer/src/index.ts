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
  render(markdown: string, opts: RenderOptions): Promise<RenderResult>;
}

declare global {
  interface Window {
    unmark: UnmarkRenderer;
  }
}

const md = createMarkdown();
let latestRender = 0;

async function render(markdown: string, { documentBaseURL }: RenderOptions): Promise<RenderResult> {
  const article = document.querySelector("article.markdown-body");
  if (!article) throw new Error('index.html has no <article class="markdown-body">');
  const renderId = ++latestRender;

  // Set before inserting content so relative <img> URLs resolve against the document,
  // not the renderer bundle (#22).
  setDocumentBase(documentBaseURL);
  const env: RenderEnv = { headings: [] };
  // Documents are untrusted: nothing markdown-it emits reaches the DOM unsanitized (#15).
  const content = sanitize(md.render(markdown, env));
  // KaTeX is a lazy chunk only documents with math load (unmark-1793451433078-17-487f189f).
  // Its output is built after sanitizing, from TeX that was sanitized as text. Rendered
  // before the swap so the scroll anchor below measures the final layout.
  if (content.querySelector(".math")) {
    const { renderMath } = await import("./math.ts");
    renderMath(content);
    // A reload that started while KaTeX loaded has already shown the newer content.
    if (renderId !== latestRender) return { headings: env.headings };
  }
  // Captured after parsing, right before the swap, so a reload keeps the reader's place (#24).
  const anchor = captureScrollAnchor(article);
  article.replaceChildren(content);
  if (anchor) restoreScrollAnchor(article, anchor);

  return { headings: env.headings };
}

function setDocumentBase(href: string): void {
  let base = document.head.querySelector("base");
  if (!base) {
    base = document.createElement("base");
    document.head.prepend(base);
  }
  base.href = href;
}

window.unmark = { render };
