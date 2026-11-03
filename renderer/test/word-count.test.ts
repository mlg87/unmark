// @vitest-environment jsdom

// The status bar's word count (unmark-1793451440089-32-11f0a691, q35): the Preview's text,
// not the markdown, without the front matter.

import { afterEach, beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";
import { countWords } from "../src/word-count.ts";

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function wordCountOf(markdown: string): Promise<number | null> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
  return window.unmark.wordCount();
}

test("markdown syntax and link URLs don't count", async () => {
  expect(await wordCountOf("**Hello** [world](https://x)")).toBe(2);
});

test("the front-matter table doesn't count", async () => {
  expect(await wordCountOf("---\ntitle: Several words of title\ntags: [a, b]\n---\n\nHello")).toBe(
    1,
  );
});

test("the footnotes section counts, but not its heading only screen readers read", async () => {
  // "Claim" with its superscript reference number, as it reads on screen, and "Source".
  expect(await wordCountOf("Claim[^1].\n\n[^1]: Source.")).toBe(2);
});

test("an empty document has no words", async () => {
  expect(await wordCountOf("")).toBe(0);
});

test("raw HTML the sanitizer drops doesn't count", async () => {
  // Elements GitHub's allowlist drops with their content; GFM's tag filter escapes <script>.
  expect(await wordCountOf("Hello <video>fallback words</video>")).toBe(1);
  expect(await wordCountOf("<svg>\n<text>Drawn words</text>\n</svg>\n\nHello")).toBe(1);
});

test("counts the words the Preview shows of every kind of block", async () => {
  const markdown = [
    "# Heading *one*",
    "Some **bold** and ~~struck~~ text with `code`, a [link](https://x/y) and https://example.com.",
    "> [!NOTE]\n> An alert :smile: with an emoji.",
    "- [ ] a task\n- [x] done task\n  1. nested item",
    "| left | right |\n| --- | --- |\n| a&amp;b | c &lt; d |",
    "```js\nconst answer = 42; // highlighted\n```",
    "![alt text](pic.png) &copy; Fin",
  ].join("\n\n");
  const count = await wordCountOf(markdown);
  const article = document.querySelector("article.markdown-body") as Element;
  expect(count).toBe(countWords(article.textContent ?? ""));
});

test("an edit changes the count", async () => {
  expect(await wordCountOf("# Title\n\nOne two.\n\nThree.")).toBe(4);
  expect(await wordCountOf("# Title\n\nOne two four.\n\nThree.")).toBe(5);
  expect(await wordCountOf("# Title\n\nThree.")).toBe(2);
});

test("counts the pieces rendered in the background, not just the first screen", async () => {
  vi.useFakeTimers();
  // jsdom has no layout; makes the first chunk overfill the viewport, as on a real screen.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 1e6));
  const paragraphs = Array.from({ length: 2000 }, (_, n) => `Paragraph number ${n}.`);
  await window.unmark.render(paragraphs.join("\n\n"), { documentBaseURL: "file:///docs/" });
  const count = window.unmark.wordCount();
  await vi.runAllTimersAsync();
  expect(await count).toBe(3 * paragraphs.length);
});

test("a count asked for before a newer render is that render's", async () => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 1e6));
  const long = Array.from({ length: 2000 }, (_, n) => `Paragraph number ${n}.`).join("\n\n");
  await window.unmark.render(long, { documentBaseURL: "file:///docs/" });
  const count = window.unmark.wordCount();
  await window.unmark.render("Just three words", { documentBaseURL: "file:///docs/" });
  await vi.runAllTimersAsync();
  expect(await count).toBe(3);
});
