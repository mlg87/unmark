// Draws the document's ```mermaid blocks (#19). index.ts imports this module only when
// a document has one, so esbuild splits Mermaid into its own chunk and documents
// without diagrams never load it (epic #3, q3, q38, q55).
//
// Mermaid's SVG goes into the DOM after sanitize.ts runs, because GitHub's allowlist
// drops <svg>. That is safe because securityLevel 'strict' makes Mermaid escape the
// diagram's labels and disables click handlers. sanitize.ts documents this exception.

import mermaid from "mermaid";
import type { OutputMode } from "./index.ts";
import { carrySourceLine } from "./source-lines.ts";

const DIAGRAM_CLASS = "mermaid-diagram";

/** The source each diagram container was drawn from, kept to redraw it in the other theme. */
const sources = new WeakMap<Element, string>();

let colorScheme: MediaQueryList | undefined;
let outputMode: OutputMode = "screen";
let nextId = 0;
// Mermaid's config is global, so passes run one at a time: a theme change mid-pass
// must not switch the theme under diagrams still drawing.
let queue: Promise<void> = Promise.resolve();

/**
 * Replaces each `<pre data-mermaid>` under `root` with its diagram, or with an error box.
 * When `mode` differs from the last call's, redraws the diagrams already under `root` too.
 */
export function renderDiagrams(root: ParentNode, mode: OutputMode = "screen"): Promise<void> {
  const containers = [...root.querySelectorAll("pre[data-mermaid]")].map((pre) => {
    const container = document.createElement("div");
    container.className = DIAGRAM_CLASS;
    sources.set(container, pre.textContent ?? "");
    carrySourceLine(pre, container);
    pre.replaceWith(container);
    return container;
  });
  if (!colorScheme) {
    colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    // Redraws every diagram on the page, which by then may be a reloaded document's.
    colorScheme.addEventListener("change", () => {
      void enqueue([...document.querySelectorAll(`.${DIAGRAM_CLASS}`)]);
    });
  }
  if (mode === outputMode) return enqueue(containers);
  outputMode = mode;
  return enqueue([...root.querySelectorAll(`.${DIAGRAM_CLASS}`)]);
}

function enqueue(containers: Element[]): Promise<void> {
  queue = queue.then(() => draw(containers));
  return queue;
}

async function draw(containers: Element[]): Promise<void> {
  // Print output is light in either appearance (#34).
  const dark = outputMode === "screen" && (colorScheme?.matches ?? false);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    darkMode: dark,
    // Throw instead of drawing Mermaid's own error diagram, so a broken block shows the
    // error box with its source.
    suppressErrorRendering: true,
  });
  for (const container of containers) {
    const source = sources.get(container);
    if (source === undefined) continue;
    try {
      // Each SVG scopes its <style> to its id, so ids must stay unique across redraws.
      const { svg } = await mermaid.render(`mermaid-${nextId++}`, source);
      container.innerHTML = svg;
    } catch (error) {
      container.replaceChildren(errorBox(error, source));
    }
  }
}

// github.com's output for a diagram it can't parse, as for math: the message in a
// bordered box (render-error.css), then the source as a code block.
function errorBox(error: unknown, source: string): DocumentFragment {
  const message = document.createElement("div");
  message.className = "mermaid-error";
  message.textContent = error instanceof Error ? error.message : String(error);
  const code = document.createElement("code");
  code.textContent = source;
  const pre = document.createElement("pre");
  pre.append(code);
  const fragment = document.createDocumentFragment();
  fragment.append(message, pre);
  return fragment;
}
