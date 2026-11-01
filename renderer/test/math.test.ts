// @vitest-environment jsdom

// Golden tests for math (unmark-1793451433078-17-487f189f), through the full Preview
// pipeline (markdown-it → sanitize → lazy KaTeX → DOM insert).

import { beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";
import { withoutSourceLines } from "./without-source-lines.ts";

// Counts evaluations of the lazily imported KaTeX module: a document without math must
// never trigger the dynamic import.
const mathModuleLoads = vi.hoisted(() => vi.fn());
vi.mock("../src/math.ts", async (importOriginal) => {
  mathModuleLoads();
  return importOriginal();
});

let article: Element;

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
});

async function render(markdown: string): Promise<void> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
}

// First in the file: once loaded, the module stays cached for the later tests.
test("a document without math doesn't import KaTeX, and one with math does", async () => {
  await render("# Prices\n\nCosts $5 and $10, `$x$` in code.\n\n```\n$$x$$\n```");
  expect(mathModuleLoads).not.toHaveBeenCalled();
  expect(article.querySelector(".katex")).toBeNull();

  await render("$x$");
  expect(mathModuleLoads).toHaveBeenCalledOnce();
});

test("$a_b$ renders KaTeX, not emphasis", async () => {
  await render("$a_b$ and $c_d$");
  expect(article.querySelectorAll("p > span > span.katex")).toHaveLength(2);
  expect(article.querySelector("em")).toBeNull();
  expect(article.querySelector(".math")).toBeNull();
});

test.each([
  ["$$ block", "$$\n\\sum_{i=1}^n i\n$$"],
  ["```math fence", "```math\n\\sum_{i=1}^n i\n```"],
])("a %s renders in display mode", async (_name, markdown) => {
  await render(markdown);
  expect(article.querySelector(":scope > div > span.katex-display")).not.toBeNull();
  expect(article.querySelector("pre")).toBeNull();
});

test("unparseable TeX shows KaTeX's message in a box, then the source", async () => {
  await render("$\\frac{1}{$");
  const box = article.querySelector(".math-error");
  expect(box?.textContent).toMatch(/^KaTeX parse error: /);
  expect(box?.nextElementSibling?.outerHTML).toBe("<pre><code>\\frac{1}{</code></pre>");
  expect(article.querySelector(".katex")).toBeNull();
});

test("TeX that looks like markup stays text", async () => {
  await render("$\\text{<img src=x onerror=alert(1)>}$");
  expect(article.querySelector("img")).toBeNull();
  expect(article.querySelector(".katex")).not.toBeNull();
});

test("raw HTML can't put attributes beyond data-display on a placeholder", async () => {
  await render('<span class="math btn" data-display="true" data-x="1">x</span>');
  expect(article.querySelector("[data-x], .btn")).toBeNull();
  expect(article.querySelector(".katex-display")).not.toBeNull();
});

test("a reload while KaTeX renders keeps the newer content", async () => {
  const older = render("$x$ older");
  await render("newer");
  await older;
  expect(withoutSourceLines(article.innerHTML.trim())).toBe("<p>newer</p>");
});
