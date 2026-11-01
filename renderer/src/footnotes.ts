// Footnotes in github.com's markup (#16), which github-markdown-css styles: the
// reference shows as [1] via `[data-footnote-ref]`, and the section is ruled off by
// `.footnotes` rather than an <hr>.

import type { MarkdownIt, Token } from "markdown-it";
import footnote from "markdown-it-footnote";
import { extendAllowlist } from "./sanitize.ts";

export function footnotes(md: MarkdownIt): void {
  md.use(footnote);

  const rules = md.renderer.rules;
  rules.footnote_ref = (tokens, idx) => {
    const { number, refId } = footnoteIds(tokens, idx);
    return `<sup><a href="#fn-${number}" id="fnref-${refId}" data-footnote-ref aria-describedby="footnote-label">${number}</a></sup>`;
  };
  rules.footnote_block_open = () =>
    '<section data-footnotes class="footnotes"><h2 id="footnote-label" class="sr-only">Footnotes</h2>\n<ol>\n';
  rules.footnote_block_close = () => "</ol>\n</section>\n";
  rules.footnote_open = (tokens, idx) => `<li id="fn-${footnoteIds(tokens, idx).number}">\n`;
  rules.footnote_close = () => "</li>\n";
  // One back-reference per reference; github.com numbers the second onward (↩², ↩³).
  rules.footnote_anchor = (tokens, idx) => {
    const { refId, subNumber } = footnoteIds(tokens, idx);
    const sup = subNumber > 1 ? `<sup>${subNumber}</sup>` : "";
    return ` <a href="#fnref-${refId}" data-footnote-backref aria-label="Back to reference ${refId}" class="data-footnote-backref">↩${sup}</a>`;
  };

  extendAllowlist({
    elements: {
      section: ["data-footnotes"],
      a: ["data-footnote-ref", "data-footnote-backref"],
    },
    classes: {
      section: ["footnotes"],
      h2: ["sr-only"],
      a: ["data-footnote-backref"],
    },
  });
}

// github.com ids a footnote `fn-1` and its references `fnref-1`, `fnref-1-2`, ….
function footnoteIds(
  tokens: Token[],
  idx: number,
): { number: number; refId: string; subNumber: number } {
  const { id, subId } = (tokens[idx] as Token).meta as { id: number; subId?: number };
  const number = id + 1;
  const subNumber = (subId ?? 0) + 1;
  return { number, subNumber, refId: subNumber > 1 ? `${number}-${subNumber}` : `${number}` };
}

/** What markdown-it-footnote keeps in a render's env: each defined label's footnote, and the footnotes referenced so far. */
interface FootnoteEnv {
  footnotes?: {
    refs?: Record<string, number>;
    list?: { label?: string; count: number }[];
  };
}

/** A footnote reference a block made: its label and the footnote number and back-reference it got. */
export interface FootnoteRef {
  readonly label: string;
  readonly id: number;
  readonly subId: number;
}

/**
 * What a block's footnote references depend on and add to the render, so a later render can
 * reuse the block's rendering (chunks.ts, unmark-1793451427066-4-97884ee7.1): whether each
 * label it could reference is defined, and the references it made, in order.
 */
export interface FootnoteUse {
  readonly labels: readonly (readonly [string, boolean])[];
  readonly refs: readonly FootnoteRef[];
}

// What footnote_ref takes for a label: anything up to "]" but a space or a line break. Also
// matches in code, which only makes reuse check a label it didn't need to.
const FOOTNOTE_LABEL = /\[\^([^\] \n]+)\]/g;

/** The footnote references in a rendered block's `tokens`, which come from `source`. */
export function footnoteUse(env: object, source: string, tokens: Token[]): FootnoteUse {
  const refs = (env as FootnoteEnv).footnotes?.refs;
  const labels = [...source.matchAll(FOOTNOTE_LABEL)].map(
    ([, label]) => [label as string, refs?.[`:${label}`] !== undefined] as const,
  );
  const made: FootnoteRef[] = [];
  for (const token of tokens) {
    for (const child of token.children ?? []) {
      if (child.type !== "footnote_ref") continue;
      // An inline footnote's reference has an id alone; a block with one isn't reused anyway.
      const { label = "", id = 0, subId = 0 } = child.meta as Partial<FootnoteRef>;
      made.push({ label, id, subId });
    }
  }
  return { labels, refs: made };
}

/**
 * Makes the references `use` records again, as footnote_ref would, if each label is defined as
 * then and each reference gets the same number and back-reference; otherwise makes none.
 */
export function retakeFootnotes(env: object, use: FootnoteUse): boolean {
  const footnotes = (env as FootnoteEnv).footnotes;
  const refs = footnotes?.refs;
  if (!use.labels.every(([label, defined]) => (refs?.[`:${label}`] !== undefined) === defined)) {
    return false;
  }
  if (use.refs.length === 0) return true;
  if (!footnotes || !refs) return false;
  const list = footnotes.list ?? [];
  const added = new Map<string, number>();
  const counts = new Map<number, number>();
  let length = list.length;
  for (const { label, id, subId } of use.refs) {
    let footnote = added.get(label) ?? refs[`:${label}`];
    if (footnote === undefined) return false;
    if (footnote < 0) {
      footnote = length++;
      added.set(label, footnote);
    }
    const count = counts.get(footnote) ?? list[footnote]?.count ?? 0;
    if (footnote !== id || count !== subId) return false;
    counts.set(footnote, count + 1);
  }
  footnotes.list = list;
  for (const [label, id] of added) {
    refs[`:${label}`] = id;
    list[id] = { label, count: 0 };
  }
  for (const [id, count] of counts) (list[id] as { count: number }).count = count;
  return true;
}
