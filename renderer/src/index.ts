import type { Heading, RenderEnv } from "./headings.ts";
import { createMarkdown } from "./markdown.ts";
import { sanitize } from "./sanitize.ts";

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

async function render(markdown: string, { documentBaseURL }: RenderOptions): Promise<RenderResult> {
  const article = document.querySelector("article.markdown-body");
  if (!article) throw new Error('index.html has no <article class="markdown-body">');

  // Set before inserting content so relative <img> URLs resolve against the document,
  // not the renderer bundle (#22).
  setDocumentBase(documentBaseURL);
  const env: RenderEnv = { headings: [] };
  // Documents are untrusted: nothing markdown-it emits reaches the DOM unsanitized (#15).
  article.replaceChildren(sanitize(md.render(markdown, env)));

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
