// Parses and renders a document a top-level block at a time, so the Preview shows the top
// of a long document before the rest is parsed (q47: a 1 MB file opens in under 1 s).
// Concatenated, the pieces equal `md.render()`'s output.
//
// `md.parse()` runs each core rule over the whole document in turn. Only the block rules
// need the whole document (link reference and footnote definitions can come after their
// uses), and they're about a fifth of the parse. The inline rule and the rules after it
// only read and rewrite tokens within a block, so they run here one block at a time, in
// document order, which keeps what depends on order (footnote numbers, heading ids, the
// outline) the same. footnote_tail is the exception: it gathers every footnote definition
// into a section at the end, so it runs once, after the last block.

import type { Env, MarkdownIt, StateCore, Token } from "markdown-it";

/**
 * Yields the HTML of `src` one top-level block at a time: the smallest pieces that can
 * be sanitized on their own. `env` collects what `md.parse()` would, such as the outline,
 * as the blocks are yielded.
 *
 * Blocks inside a raw HTML element the document leaves open across blocks, such as
 * `<details>` wrapped around markdown, come as one piece with the element: sanitized
 * apart, the HTML parser would close the element early and move the blocks out of it.
 */
export function* htmlBlocks(md: MarkdownIt, src: string, env: Env): Generator<string> {
  const rules = md.core.ruler.__rules__.filter((rule) => rule.enabled);
  const inline = rules.findIndex((rule) => rule.name === "inline");
  const parseInline = rules[inline];
  const footnoteTail = rules[inline + 1];
  if (!parseInline || footnoteTail?.name !== "footnote_tail") {
    throw new Error("Expected markdown-it's core rules to run footnote_tail right after inline");
  }
  const laterRules = rules.slice(inline + 2).map((rule) => rule.fn);

  const state = new md.core.State(src, md, env);
  for (const rule of rules.slice(0, inline)) rule.fn(state);
  // Rules read and replace `tokens` on the state; a block's view shares everything else.
  const runOn = (tokens: Token[], ruleFns: ((state: StateCore) => void)[]): Token[] => {
    const view: StateCore = Object.create(state, { tokens: { value: tokens, writable: true } });
    for (const rule of ruleFns) rule(view);
    return view.tokens;
  };

  const openElements: string[] = [];
  let html = "";
  let depth = 0;
  let start = 0;
  for (let index = 0; index < state.tokens.length; index++) {
    depth += (state.tokens[index] as Token).nesting;
    if (depth !== 0) continue;
    let block = runOn(state.tokens.slice(start, index + 1), [parseInline.fn]);
    start = index + 1;
    // A footnote definition renders in the footnotes section, which footnote_tail builds.
    if (block[0]?.type === "footnote_reference_open") continue;
    block = runOn(block, laterRules);
    for (const token of block) trackRawHtml(token, openElements);
    html += md.renderer.render(block, md.options, env);
    if (openElements.length > 0) continue;
    yield html;
    html = "";
  }

  footnoteTail.fn(state);
  if (state.tokens.at(-1)?.type === "footnote_block_close") {
    const section = state.tokens.findLastIndex((token) => token.type === "footnote_block_open");
    html += md.renderer.render(runOn(state.tokens.slice(section), laterRules), md.options, env);
  }
  if (html) yield html;
}

// Void elements never contain anything, whether or not their tag ends in "/>".
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// A comment, or a start or end tag with its attributes (quoted values may contain ">").
const TAG =
  /<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;

/**
 * Updates the stack of raw HTML elements still open. An end tag closes back to its start
 * tag, as the HTML parser does; elements the parser closes implicitly, such as an
 * unclosed `<p>`, stay on the stack, which only means fewer places to split.
 */
function trackRawHtml(token: Token, openElements: string[]): void {
  if (token.type === "html_block") trackTags(token.content, openElements);
  for (const child of token.children ?? []) {
    if (child.type === "html_inline") trackTags(child.content, openElements);
  }
}

function trackTags(html: string, openElements: string[]): void {
  for (const [, slash, rawName] of html.matchAll(TAG)) {
    if (rawName === undefined) continue;
    const name = rawName.toLowerCase();
    if (slash) {
      const open = openElements.lastIndexOf(name);
      if (open >= 0) openElements.length = open;
    } else if (!VOID_ELEMENTS.has(name)) {
      openElements.push(name);
    }
  }
}
