// Source-line markers (unmark-1793451437275-26-1e1952b0): every rendered block names the
// 0-based line of the source it starts on, from markdown-it's token maps. Split mode's scroll
// sync reads them to keep the Source and the Preview on the same line (epic #5, q16), and
// task-list toggles and the Outline read the same map.

import type { MarkdownIt, Token } from "markdown-it";
import { extendAllowlist } from "./sanitize.ts";

export const SOURCE_LINE = "data-source-line";

// Block tokens whose map doesn't name a rendered element: an inline token's content renders
// inside its parent's element, raw HTML renders as written, and an alert's title is part of
// the alert's <div>, which carries the alert's line.
const UNMARKED: Record<string, true> = { inline: true, html_block: true, alert_title: true };

// Tokens whose render rules ignore `token.attrs`, or put them on an inner element: the
// default fence rule puts them on <code>, and the Mermaid, math, and front-matter rules
// build their markup themselves. These get the marker on the first tag of their output.
const SELF_RENDERED = ["fence", "math_block", "front_matter"];

export function sourceLineMarkers(md: MarkdownIt): void {
  // After block parsing, which sets every map, and before inline parsing, so chunks.ts runs
  // it once over the whole document instead of once per block.
  md.core.ruler.after("block", "source_lines", (state) => {
    state.tokens.forEach((token, index) => {
      if (!isMarked(token) || SELF_RENDERED.includes(token.type)) return;
      token.attrSet(SOURCE_LINE, String(sourceLine(state.tokens, index)));
    });
  });

  // Registered last in createMarkdown, so these wrap every other plugin's version of the rules.
  for (const type of SELF_RENDERED) {
    const render = md.renderer.rules[type];
    if (!render) throw new Error(`markdown-it has no "${type}" render rule to mark`);
    md.renderer.rules[type] = (tokens, idx, options, env, self) => {
      const html = render(tokens, idx, options, env, self);
      const token = tokens[idx] as Token;
      if (!isMarked(token)) return html;
      const line = sourceLine(tokens, idx);
      return html.replace(/^<[A-Za-z][\w-]*/, (tag) => `${tag} ${SOURCE_LINE}="${line}"`);
    };
  }

  // Raw HTML in a document can carry the attribute too. That can only misplace the scroll
  // sync for that document, which is the author's own.
  extendAllowlist({ attributes: [SOURCE_LINE] });
}

/** Moves the marker to the element that replaces a marked block, such as a drawn diagram. */
export function carrySourceLine(from: Element, to: Element): void {
  const line = from.getAttribute(SOURCE_LINE);
  if (line !== null) to.setAttribute(SOURCE_LINE, line);
}

function isMarked(token: Token): boolean {
  return token.map !== null && token.nesting !== -1 && !UNMARKED[token.type];
}

function sourceLine(tokens: Token[], index: number): number {
  const token = tokens[index] as Token;
  // @mdit/plugin-alert maps the alert from the line after its `> [!NOTE]` line, which only
  // the alert_title token right after it maps.
  const title = tokens[index + 1];
  if (token.type === "alert_open" && title?.type === "alert_title" && title.map) {
    return title.map[0];
  }
  return (token.map as [number, number])[0];
}
