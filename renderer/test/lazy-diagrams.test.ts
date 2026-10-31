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
  expect(diagrams.renderDiagrams).toHaveBeenCalledWith(article);
  expect(article.innerHTML.trim()).toBe(
    '<pre class="mermaid-source" data-mermaid="">graph TD; A--&gt;B&lt;script&gt;\n</pre>',
  );
});

test("the sanitizer still drops data-mermaid on elements other than <pre>", async () => {
  await render('<div data-mermaid class="mermaid-source">graph TD; A-->B</div>');
  expect(article.innerHTML.trim()).toBe("<div>graph TD; A--&gt;B</div>");
});
