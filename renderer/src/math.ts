// Renders the math placeholders markdown.ts emits (unmark-1793451433078-17-487f189f).
// This module and KaTeX form a separate chunk that index.ts imports only for documents
// that contain math, so every other document skips KaTeX's code, CSS, and fonts (epic #3).

import katex from "katex";
import { carrySourceLine } from "./source-lines.ts";

// build.mjs copies KaTeX's stylesheet next to the chunks, with its fonts beside it. The
// error box's style is render-error.css, which the page loads. Resolved against this
// chunk's URL because <base> points at the document's folder, not the renderer's.
const katexStylesheet = document.createElement("link");
katexStylesheet.rel = "stylesheet";
katexStylesheet.href = new URL("katex/katex.min.css", import.meta.url).href;
document.head.append(katexStylesheet);

/** Replaces every `.math` placeholder under `root` with KaTeX's output, or an error box. */
export function renderMath(root: ParentNode): void {
  for (const placeholder of root.querySelectorAll<HTMLElement>(".math")) {
    const source = placeholder.textContent ?? "";
    const output = document.createElement(placeholder.localName);
    carrySourceLine(placeholder, output);
    try {
      katex.render(source, output, {
        displayMode: placeholder.dataset.display === "true",
        throwOnError: true,
      });
      placeholder.replaceWith(output);
    } catch (error) {
      if (!(error instanceof katex.ParseError)) throw error;
      const [box, code] = parseErrorBox(error.message, source);
      carrySourceLine(placeholder, box);
      placeholder.replaceWith(box, code);
    }
  }
}

// github.com's output for TeX it can't parse: the parser's message in a bordered box,
// then the source as a code block.
function parseErrorBox(message: string, source: string): [HTMLElement, HTMLElement] {
  const box = document.createElement("div");
  box.className = "math-error";
  box.textContent = message;
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = source;
  pre.append(code);
  return [box, pre];
}
