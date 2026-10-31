// @vitest-environment jsdom

// Long documents render in chunks (q47): the viewport's worth first, the rest in background
// tasks. Chunking must never change what the Preview ends up showing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";
import { htmlBlocks } from "../src/chunks.ts";
import { createMarkdown } from "../src/markdown.ts";
import { sanitize } from "../src/sanitize.ts";
import { parseSpecExamples } from "./spec-examples.ts";

const md = createMarkdown();

// Every block type the renderer emits, with raw HTML wrapped around markdown, repeated past
// the chunk size so the document needs many chunks.
const section = (n: number) => `## Part ${n}

Text with a [link](https://example.com/${n}), www.example.com, and a footnote.[^${n}]

| a | b |
| :-- | --: |
| ${n} | x |

- [x] done
- [ ] not done

\`\`\`js
const n = ${n};
\`\`\`

> [!NOTE]
> An alert.

<details>
<summary>More</summary>

Hidden **markdown** ${n}.

</details>

[^${n}]: Footnote ${n}.
`;
const longDocument = Array.from({ length: 60 }, (_, n) => section(n)).join("\n");

// What depends on document order: footnote numbers (including a reference inside another
// footnote and an inline footnote), heading ids repeated in a footnote, and a link
// reference defined after its use.
const orderSensitiveDocument = `[^b]: Defined first, citing [^a] and [later].

# Notes

Uses [^a], then [^b], and ^[an inline note with :tada:].

[^a]: A footnote with a heading:

    # Notes

# Notes

[later]: https://example.com/later
`;

let article: Element;

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function render(markdown: string) {
  return window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
}

function renderedAllAtOnce(markdown: string): string {
  const container = document.createElement("div");
  container.append(sanitize(md.render(markdown, { headings: [] })));
  return container.innerHTML;
}

/** jsdom has no layout; makes the first chunk overfill the viewport, as on a real screen. */
function tallBlocks(): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 1e6));
}

test.each([
  ...["spec.txt", "extensions.txt"].flatMap((file) =>
    parseSpecExamples(file, readFileSync(join(import.meta.dirname, "fixtures", file), "utf8")).map(
      (example) => [example.id, example.markdown],
    ),
  ),
  ["a long document", longDocument],
  ["an order-sensitive document", orderSensitiveDocument],
])("the blocks of %s add up to the whole document's HTML and outline", (_name, markdown) => {
  const env = { headings: [] };
  const blocks = [...htmlBlocks(md, markdown, env)];
  const parsedEnv = { headings: [] };
  expect(blocks.join("")).toBe(
    md.renderer.render(md.parse(markdown, parsedEnv), md.options, parsedEnv),
  );
  expect(env.headings).toEqual(parsedEnv.headings);
});

test("a raw HTML element around markdown blocks comes as one block", () => {
  const markdown =
    "Before\n\n<details>\n<summary>S</summary>\n\nInside\n\n- item\n\n</details>\n\nAfter";
  const blocks = [...htmlBlocks(md, markdown, { headings: [] })];
  expect(blocks).toHaveLength(3);
  expect(blocks[1]).toMatch(/^<details>[\s\S]*<li>item<\/li>[\s\S]*<\/details>\n$/);
});

test("the render resolves with the first chunk and the rest follows", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await render(longDocument);
  const expected = renderedAllAtOnce(longDocument);
  expect(article.innerHTML.length).toBeLessThan(expected.length);
  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(expected);
});

test("outline() waits for the blocks parsed in the background", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await render(longDocument);
  const outline = window.unmark.outline();
  await vi.runAllTimersAsync();
  expect((await outline).map(({ id }) => id)).toEqual(
    Array.from({ length: 60 }, (_, n) => `part-${n}`),
  );
});

test("a newer render stops the previous one's background chunks", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await render(longDocument);
  await render("# Replaced");
  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(renderedAllAtOnce("# Replaced"));
});

test("scrolling to an element in a later chunk waits for it", async () => {
  vi.useFakeTimers();
  tallBlocks();
  // jsdom doesn't implement scrollIntoView.
  const scrolledTo = vi.fn();
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolledTo(this.id);
  };
  await render(longDocument);
  expect(document.getElementById("part-59")).toBeNull();
  const scrolled = window.unmark.scrollToElement("part-59");
  await vi.runAllTimersAsync();
  await scrolled;
  expect(scrolledTo).toHaveBeenCalledWith("part-59");
});

test("a reload while scrolled swaps in the whole document at once", async () => {
  await render("# Old");
  tallBlocks();
  vi.spyOn(window, "scrollY", "get").mockReturnValue(100);
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  await render(longDocument);
  expect(article.innerHTML).toBe(renderedAllAtOnce(longDocument));
});
