// @vitest-environment jsdom

// Golden tests for fenced-code highlighting (#17), through the full Preview pipeline
// (markdown-it → highlight.js → sanitize → DOM insert).

import { beforeAll, expect, test } from "vitest";
import "../src/index.ts";

let article: Element;

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
});

async function render(markdown: string): Promise<string> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
  return article.innerHTML.trim();
}

test("highlights a fence by its declared language", async () => {
  expect(await render("```js\nconst a = 1\n```")).toBe(
    '<pre><code><span class="hljs-keyword">const</span> a = <span class="hljs-number">1</span>\n</code></pre>',
  );
});

test("keeps the suffix classes of a dotted scope, which the themes select", async () => {
  expect(await render("```js\nclass Foo {}\n```")).toBe(
    '<pre><code><span class="hljs-keyword">class</span> <span class="hljs-title class_">Foo</span> {}\n</code></pre>',
  );
});

test.each([
  ["an unknown language", "```nosuchlang\nconst a = <b>&</b>\n```"],
  ["no language, without auto-detection", "```\nconst a = <b>&</b>\n```"],
])("renders %s as escaped plain text", async (_name, markdown) => {
  const html = await render(markdown);
  expect(html).toBe("<pre><code>const a = &lt;b&gt;&amp;&lt;/b&gt;\n</code></pre>");
  expect(html).not.toContain("hljs-");
});

test("highlighted markup in a fence stays text", async () => {
  await render("```html\n<script>alert(1)</script>\n```");
  expect(article.querySelector("script")).toBeNull();
  expect(article.querySelector("code")?.textContent).toBe("<script>alert(1)</script>\n");
});

test("raw HTML spans keep only highlight.js classes", async () => {
  expect(await render('<span class="hljs-keyword btn x_y">a</span>')).toBe(
    '<p><span class="hljs-keyword">a</span></p>',
  );
});
