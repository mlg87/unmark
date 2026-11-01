// GitHub-style heading anchors and the document outline (#16).

import { slug } from "github-slugger";
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

// One set of ids per render: ids restart at `a`, `a-1` for every document, as on github.com.
const headingIds = new WeakMap<object, HeadingIds>();

/**
 * The heading ids a render has given, made unique as github-slugger and github.com make them:
 * `a`, then `a-1`, `a-2`. A render reuses an earlier rendering of a heading only when its id
 * comes out the same (chunks.ts, unmark-1793451427066-4-97884ee7.1), so the ids each rendering
 * took are recorded to take them again.
 */
export class HeadingIds {
  readonly #taken = new Map<string, number>();
  #recorded: [string, string][] = [];

  /** Gives a heading whose text slugs to `base` its id. */
  take(base: string): string {
    const id = uniqueId(base, this.#taken);
    this.#recorded.push([base, id]);
    return id;
  }

  /** Starts a new record of the ids taken: each slug and the id it got. */
  record(): readonly (readonly [string, string])[] {
    this.#recorded = [];
    return this.#recorded;
  }

  /** Takes the ids `recorded` again if each comes out the same as then, or else none of them. */
  retake(recorded: readonly (readonly [string, string])[]): boolean {
    if (recorded.length === 0) return true;
    const added = new Map<string, number>();
    const taken = {
      has: (id: string) => added.has(id) || this.#taken.has(id),
      get: (id: string) => added.get(id) ?? this.#taken.get(id),
      set: (id: string, count: number) => added.set(id, count),
    };
    if (!recorded.every(([base, id]) => uniqueId(base, taken) === id)) return false;
    for (const [id, count] of added) this.#taken.set(id, count);
    return true;
  }
}

/** The heading ids of the render collecting into `env`. */
export function headingIdsFor(env: object): HeadingIds {
  let ids = headingIds.get(env);
  if (!ids) {
    ids = new HeadingIds();
    headingIds.set(env, ids);
  }
  return ids;
}

export function headingAnchors(md: MarkdownIt): void {
  md.use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    getTokensText: headingText,
    // HeadingIds already makes slugs unique the way github.com does (`a`, `a-1`), so
    // markdown-it-anchor's own de-duplication never kicks in.
    slugifyWithState: (text, state) => headingIdsFor(state.env).take(slug(text)),
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

// github-slugger's de-duplication: a slug taken before gets the next free `-n` suffix, counted
// per slug.
function uniqueId(base: string, taken: Pick<Map<string, number>, "has" | "get" | "set">): string {
  let id = base;
  while (taken.has(id)) {
    const count = (taken.get(base) ?? 0) + 1;
    taken.set(base, count);
    id = `${base}-${count}`;
  }
  taken.set(id, 0);
  return id;
}

// Plain text as github.com slugs it: emoji count as text, link and image markup doesn't.
function headingText(tokens: Token[]): string {
  return tokens
    .filter(({ type }) => type === "text" || type === "code_inline" || type === "emoji")
    .map(({ content }) => content)
    .join("");
}
