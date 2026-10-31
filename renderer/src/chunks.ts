// Splits a parsed document into pieces of HTML that can be sanitized and inserted one at
// a time, so the Preview shows the top of a long document before the rest is ready (q47:
// a 1 MB file opens in under 1 s). Concatenated, the pieces equal `md.render()`'s output.

import type { MarkdownIt, Token } from "markdown-it";

/**
 * Yields the rendered HTML of `tokens` one top-level block at a time: the smallest pieces
 * that can be sanitized on their own.
 *
 * Blocks inside a raw HTML element the document leaves open across blocks, such as
 * `<details>` wrapped around markdown, come as one piece with the element: sanitized
 * apart, the HTML parser would close the element early and move the blocks out of it.
 */
export function* htmlBlocks(
  md: MarkdownIt,
  tokens: Token[],
  env: Record<string, unknown>,
): Generator<string> {
  const openElements: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as Token;
    depth += token.nesting;
    trackRawHtml(token, openElements);
    if (depth !== 0 || openElements.length > 0) continue;
    yield md.renderer.render(tokens.slice(start, index + 1), md.options, env);
    start = index + 1;
  }
  if (start < tokens.length) yield md.renderer.render(tokens.slice(start), md.options, env);
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
