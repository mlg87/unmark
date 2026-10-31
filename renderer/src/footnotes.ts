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
