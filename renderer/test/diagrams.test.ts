// @vitest-environment jsdom

// diagrams.ts (#19) with Mermaid mocked at the module boundary: jsdom can't lay out
// the SVG text Mermaid measures.

import { beforeEach, expect, test, vi } from "vitest";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

// jsdom has no matchMedia. This one reports dark mode while `dark` is set and lets a
// test fire the change event macOS sends when the appearance switches.
const colorScheme = vi.hoisted(() => {
  const listeners: (() => void)[] = [];
  return {
    dark: false,
    listeners,
    switchTo(dark: boolean) {
      this.dark = dark;
      for (const listener of listeners) listener();
    },
  };
});
vi.stubGlobal("matchMedia", () => ({
  get matches() {
    return colorScheme.dark;
  },
  addEventListener: (_type: string, listener: () => void) => colorScheme.listeners.push(listener),
}));

import { renderDiagrams } from "../src/diagrams.ts";

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  colorScheme.dark = false;
});

function articleWith(...sources: string[]): Element {
  document.body.innerHTML = `<article>${sources
    .map((source) => `<pre class="mermaid-source" data-mermaid="">${source}</pre>`)
    .join("")}</article>`;
  return document.querySelector("article") as Element;
}

test("draws each block as Mermaid's SVG in strict mode, light theme", async () => {
  mermaid.render.mockImplementation(async (id: string, source: string) => ({
    svg: `<svg id="${id}"><text>${source}</text></svg>`,
  }));
  const article = articleWith("graph TD; A--&gt;B", "graph LR; C--&gt;D");

  await renderDiagrams(article);

  expect(mermaid.initialize).toHaveBeenCalledWith(
    expect.objectContaining({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      darkMode: false,
    }),
  );
  expect(mermaid.render.mock.calls.map(([, source]) => source)).toEqual([
    "graph TD; A-->B",
    "graph LR; C-->D",
  ]);
  expect(article.querySelector("pre")).toBeNull();
  const diagrams = [...article.querySelectorAll(".mermaid-diagram > svg")];
  expect(diagrams.map((svg) => svg.textContent)).toEqual(["graph TD; A-->B", "graph LR; C-->D"]);
  // Each SVG's <style> is scoped to its id, so two diagrams must not share one.
  expect(new Set(diagrams.map((svg) => svg.id)).size).toBe(2);
});

test("a parse error shows the error box with the source below it", async () => {
  mermaid.render.mockRejectedValue(new Error("Parse error on line 1:\ngraph TD; A-->\n"));
  const article = articleWith("graph TD; A--&gt;");

  await renderDiagrams(article);

  const diagram = article.querySelector(".mermaid-diagram");
  expect(diagram?.children[0]?.className).toBe("mermaid-error");
  expect(diagram?.children[0]?.textContent).toBe("Parse error on line 1:\ngraph TD; A-->\n");
  expect(diagram?.children[1]?.outerHTML).toBe("<pre><code>graph TD; A--&gt;</code></pre>");
  expect(article.querySelector("svg")).toBeNull();
});

test("switching to dark mode redraws every diagram on the page in the dark theme", async () => {
  mermaid.render.mockImplementation(async () => ({
    svg: `<svg data-theme="${mermaid.initialize.mock.lastCall?.[0].theme}"></svg>`,
  }));
  const article = articleWith("graph TD; A--&gt;B");
  await renderDiagrams(article);
  expect(article.querySelector("svg")?.getAttribute("data-theme")).toBe("default");

  colorScheme.switchTo(true);
  // The redraw is queued behind any pass in flight; an empty pass waits it out.
  await renderDiagrams(document.createElement("div"));

  expect(mermaid.initialize).toHaveBeenLastCalledWith(
    expect.objectContaining({ theme: "dark", darkMode: true }),
  );
  expect(mermaid.render).toHaveBeenLastCalledWith(expect.any(String), "graph TD; A-->B");
  expect(article.querySelector("svg")?.getAttribute("data-theme")).toBe("dark");
});

test("print output redraws diagrams light in dark mode, and screen output redraws them dark", async () => {
  mermaid.render.mockImplementation(async () => ({
    svg: `<svg data-theme="${mermaid.initialize.mock.lastCall?.[0].theme}"></svg>`,
  }));
  colorScheme.dark = true;
  const article = articleWith("graph TD; A--&gt;B");
  await renderDiagrams(article);
  expect(article.querySelector("svg")?.getAttribute("data-theme")).toBe("dark");

  await renderDiagrams(article, "print");
  expect(mermaid.initialize).toHaveBeenLastCalledWith(
    expect.objectContaining({ theme: "default", darkMode: false }),
  );
  expect(article.querySelector("svg")?.getAttribute("data-theme")).toBe("default");

  await renderDiagrams(article, "screen");
  expect(article.querySelector("svg")?.getAttribute("data-theme")).toBe("dark");
});

test("a reload's diagrams replace the old ones as the ones a theme change redraws", async () => {
  mermaid.render.mockResolvedValue({ svg: "<svg></svg>" });
  await renderDiagrams(articleWith("graph TD; old"));
  await renderDiagrams(articleWith("graph TD; new"));
  mermaid.render.mockClear();

  colorScheme.switchTo(true);
  await renderDiagrams(document.createElement("div"));

  expect(mermaid.render.mock.calls.map(([, source]) => source)).toEqual(["graph TD; new"]);
});
