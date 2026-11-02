// @vitest-environment jsdom

// Mermaid is several MB, so diagrams.ts (which imports it) loads only for documents
// with a ```mermaid block (#19).

import { beforeAll, expect, test, vi } from "vitest";

const diagrams = vi.hoisted(() => ({ imported: false, renderDiagrams: vi.fn() }));

// The factory runs only when something imports diagrams.ts.
vi.mock("../src/diagrams.ts", () => {
  diagrams.imported = true;
  return { renderDiagrams: diagrams.renderDiagrams };
});

import "../src/index.ts";

let article: Element;

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
});

async function render(markdown: string): Promise<void> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
}

// Ordered: once a mermaid document imports the module, it stays imported.
test("a document without mermaid blocks never imports diagrams.ts", async () => {
  await render("# Title\n\n```js\nconst a = 1\n```\n\n```\ngraph TD; A-->B\n```\n\nmermaid");
  expect(diagrams.imported).toBe(false);
});

test("a mermaid block survives sanitizing as escaped source, then is handed to diagrams.ts", async () => {
  await render("```mermaid\ngraph TD; A-->B<script>\n```");
  expect(diagrams.imported).toBe(true);
  const container = article.querySelector(".mermaid-diagram");
  expect(diagrams.renderDiagrams).toHaveBeenCalledWith([container], "screen");
  expect(article.innerHTML.trim()).toBe(
    '<div data-source-line="0" class="mermaid-diagram"><pre class="mermaid-source" data-mermaid="">graph TD; A--&gt;B&lt;script&gt;\n</pre></div>',
  );
});

test("an edit elsewhere in the document doesn't draw an unchanged diagram again", async () => {
  await render("Intro\n\n```mermaid\ngraph TD; A-->B\n```");
  const container = article.querySelector(".mermaid-diagram");
  diagrams.renderDiagrams.mockClear();

  await render("Intro, edited\n\nA new paragraph\n\n```mermaid\ngraph TD; A-->B\n```");

  expect(diagrams.renderDiagrams).not.toHaveBeenCalled();
  expect(article.querySelector(".mermaid-diagram")).toBe(container);
  expect(container?.getAttribute("data-source-line")).toBe("4");
});

test("typing above two identical diagrams keeps both drawn", async () => {
  const diagram = "```mermaid\ngraph TD\n  A-->B\n```\n";
  const documentWith = (above: string) => `# Title\n${above}\n${diagram}\n${diagram}\nAfter\n`;
  diagrams.renderDiagrams.mockImplementationOnce(async (containers: Element[]) => {
    for (const container of containers) container.innerHTML = "<svg></svg>";
  });
  await render(documentWith(""));
  const svgs = [...article.querySelectorAll("svg")];
  expect(svgs).toHaveLength(2);
  diagrams.renderDiagrams.mockClear();

  // Keystrokes that change the blank lines and text right above the first diagram, which
  // used to hand the first diagram the second one's DOM and draw the second anew
  // (unmark-1793451427066-4-97884ee7.7).
  for (const above of ["\n", "\nx", "\nx\n", "\nx\n\n", "\nxy\n\n", ""]) {
    const markdown = documentWith(above);
    await render(markdown);
    expect(diagrams.renderDiagrams).not.toHaveBeenCalled();
    const drawn = [...article.querySelectorAll("svg")];
    expect(drawn).toHaveLength(2);
    for (const [index, svg] of svgs.entries()) expect(drawn[index]).toBe(svg);
    const fenceLines = markdown
      .split("\n")
      .flatMap((line, index) => (line === "```mermaid" ? [String(index)] : []));
    const markers = [...article.querySelectorAll(".mermaid-diagram")].map((container) =>
      container.getAttribute("data-source-line"),
    );
    expect(markers).toEqual(fenceLines);
  }
});

test("the sanitizer still drops data-mermaid on elements other than <pre>", async () => {
  await render('<div data-mermaid class="mermaid-source">graph TD; A-->B</div>');
  expect(article.innerHTML.trim()).toBe("<div>graph TD; A--&gt;B</div>");
});
