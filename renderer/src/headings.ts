// GitHub-style heading anchors and the document outline (#16).

import GithubSlugger from "github-slugger";
import type { MarkdownIt, Token } from "markdown-it";
import anchor from "markdown-it-anchor";
import { extendAllowlist } from "./sanitize.ts";

/** Document outline entry, in document order. */
export interface Heading {
  level: number;
  text: string;
  id: string;
}

/** Per-render state. Pass a fresh object to each `md.render()` call to collect its outline. */
export type RenderEnv = { headings: Heading[] };

// One slugger per render: ids restart at `a`, `a-1` for every document, as on github.com.
const sluggers = new WeakMap<object, GithubSlugger>();

export function headingAnchors(md: MarkdownIt): void {
  md.use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    getTokensText: headingText,
    // github-slugger already makes slugs unique the way github.com does (`a`, `a-1`), so
    // markdown-it-anchor's own de-duplication never kicks in.
    slugifyWithState: (text, state) => sluggerFor(state.env).slug(text),
    // github.com headings aren't focusable; only their anchor link is.
    tabIndex: false,
    // github-markdown-css draws GitHub's link icon on `.anchor .octicon-link` while the
    // heading is hovered, so no <svg> has to pass the sanitizer.
    permalink: anchor.permalink.ariaHidden({
      class: "anchor",
      symbol: '<span class="octicon octicon-link"></span>',
      placement: "before",
      space: false,
    }),
  });

  md.core.ruler.after("anchor", "heading_outline", (state) => {
    // Absent when a caller (e.g. the GFM spec tests) doesn't collect an outline.
    const headings = state.env.headings as Heading[] | undefined;
    if (!headings) return;
    state.tokens.forEach((token, index) => {
      const id = token.type === "heading_open" ? token.attrGet("id") : null;
      if (id === null) return;
      const text = headingText(state.tokens[index + 1]?.children ?? []);
      headings.push({ level: Number(token.tag.slice(1)), text, id: String(id) });
    });
  });

  extendAllowlist({
    classes: {
      a: ["anchor"],
      span: ["octicon", "octicon-link"],
    },
  });
}

function sluggerFor(env: object): GithubSlugger {
  let slugger = sluggers.get(env);
  if (!slugger) {
    slugger = new GithubSlugger();
    sluggers.set(env, slugger);
  }
  return slugger;
}

// Plain text as github.com slugs it: emoji count as text, link and image markup doesn't.
function headingText(tokens: Token[]): string {
  return tokens
    .filter(({ type }) => type === "text" || type === "code_inline" || type === "emoji")
    .map(({ content }) => content)
    .join("");
}
