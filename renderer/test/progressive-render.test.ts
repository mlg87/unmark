// @vitest-environment jsdom

// Long documents render in chunks (q47): the viewport's worth first, the rest in background
// tasks. Chunking must never change what the Preview ends up showing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";
import { type Block, blockCache, htmlBlocks, Rendering, spliceBlocks } from "../src/chunks.ts";
import { createMarkdown } from "../src/markdown.ts";
import { sanitize } from "../src/sanitize.ts";
import { parseSpecExamples } from "./spec-examples.ts";
import { withoutSourceLines } from "./without-source-lines.ts";

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
// The same without footnotes.
const plainSection = (n: number) =>
  section(n).replace(`, and a footnote.[^${n}]`, ".").replace(`\n[^${n}]: Footnote ${n}.\n`, "");
const plainDocument = Array.from({ length: 60 }, (_, n) => plainSection(n)).join("\n");
const paragraph30 = "Text with a [link](https://example.com/30), www.example.com.";

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

/** Renders `markdown` on an empty page, so none of its blocks is there from an earlier render. */
async function renderOnEmptyPage(markdown: string) {
  await render("");
  await vi.runAllTimersAsync();
  await render(markdown);
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
  expect(blocks.map((block) => block.html).join("")).toBe(
    md.renderer.render(md.parse(markdown, parsedEnv), md.options, parsedEnv),
  );
  expect(env.headings).toEqual(parsedEnv.headings);
});

test("a raw HTML element around markdown blocks comes as one block", () => {
  const markdown =
    "Before\n\n<details>\n<summary>S</summary>\n\nInside\n\n- item\n\n</details>\n\nAfter";
  const blocks = [...htmlBlocks(md, markdown, { headings: [] })];
  expect(blocks).toHaveLength(3);
  expect(withoutSourceLines(blocks[1]?.html ?? "")).toMatch(
    /^<details>[\s\S]*<li>item<\/li>[\s\S]*<\/details>\n$/,
  );
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

test("print output is ready only once the whole document is on the page", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await render(longDocument);
  const htmlWhenReady = window.unmark.setOutputMode("print").then(() => article.innerHTML);
  await vi.runAllTimersAsync();
  expect(await htmlWhenReady).toBe(renderedAllAtOnce(longDocument));
  await window.unmark.setOutputMode("screen");
});

test("a newer render stops the previous one's background chunks", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await render(longDocument);
  await render("# Replaced");
  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(renderedAllAtOnce("# Replaced"));
});

test("scrolling to an element in a later chunk renders up to it, not the whole document", async () => {
  vi.useFakeTimers();
  tallBlocks();
  // jsdom doesn't implement scrollIntoView.
  const scrolledTo = vi.fn();
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolledTo(this.id);
  };
  await renderOnEmptyPage(longDocument);
  expect(document.getElementById("part-30")).toBeNull();
  // No timers run, so no background task contributes to the scroll.
  await window.unmark.scrollToElement("part-30");
  expect(scrolledTo).toHaveBeenCalledWith("part-30");
  expect(document.getElementById("part-59")).toBeNull();
  // The background tasks carry on from where the scroll stopped.
  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(renderedAllAtOnce(longDocument));
});

test("a scroll whose element arrives while it waits its turn renders no further", async () => {
  vi.useFakeTimers();
  tallBlocks();
  Element.prototype.scrollIntoView = () => {};
  await renderOnEmptyPage(longDocument);
  expect(document.getElementById("part-20")).toBeNull();
  // The second call waits for the first, whose batch brings in part-20 too.
  await Promise.all([
    window.unmark.scrollToElement("part-30"),
    window.unmark.scrollToElement("part-20"),
  ]);
  expect(document.getElementById("part-59")).toBeNull();
});

test("following the Source to a line in a later chunk renders up to it, not the whole document", async () => {
  vi.useFakeTimers();
  tallBlocks();
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  await renderOnEmptyPage(longDocument);
  expect(document.getElementById("part-30")).toBeNull();
  await window.unmark.scrollToSourceLine(longDocument.split("\n").indexOf("## Part 30"));
  expect(document.getElementById("part-30")).not.toBeNull();
  expect(document.getElementById("part-59")).toBeNull();
});

test("scrolling to an element that isn't in the document renders all of it", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await render(longDocument);
  await window.unmark.scrollToElement("missing");
  expect(article.innerHTML).toBe(renderedAllAtOnce(longDocument));
});

// Edits re-render incrementally (unmark-1793451427066-4-97884ee7.1): each edit as [name,
// document before, document after]. Some change what later blocks render to without changing
// their lines (footnote numbers, heading ids, link references, raw HTML around them).
const edits: [string, string, string][] = [
  [
    "a word typed into a paragraph",
    longDocument,
    longDocument.replace("a [link](https://example.com/3)", "a [linked](https://example.com/3)"),
  ],
  ["paragraphs added at the top", longDocument, `New.\n\nAnother.\n\n${longDocument}`],
  ["a section removed", longDocument, longDocument.replace(section(10), "")],
  ["two paragraphs joined", "One\n\nTwo\n\nThree\n\n- [ ] task", "One\nTwo\n\nThree\n\n- [ ] task"],
  ["a fence opened above everything", longDocument, `\`\`\`\n${longDocument}`],
  ["a raw HTML element opened above everything", longDocument, `<div>\n\n${longDocument}`],
  [
    "a link reference defined after its use",
    "Uses [later].\n\nText",
    "Uses [later].\n\nText\n\n[later]: https://example.com/later",
  ],
  [
    "a link reference's URL changed",
    "Uses [ref].\n\n[ref]: https://a.example.com",
    "Uses [ref].\n\n[ref]: https://b.example.com",
  ],
  [
    "a footnote added before the others",
    longDocument,
    `First.[^new]\n\n[^new]: New.\n\n${longDocument}`,
  ],
  ["a heading added before others with its name", longDocument, `## Part 5\n\n${longDocument}`],
  [
    "raw HTML with its own source-line marker moved down",
    '<p data-source-line="7">Raw</p>\n\nText',
    'Above\n\n<p data-source-line="7">Raw</p>\n\nText',
  ],
  ["an alert's type changed", "> [!NOTE]\n> Body.", "> [!TIP]\n> Body."],
  [
    "footnote references swapped",
    orderSensitiveDocument,
    orderSensitiveDocument.replace("Uses [^a], then [^b]", "Uses [^b], then [^a]"),
  ],
];

// Edits spliced into the document before them, block-parsing only what they may have changed,
// each as [name, document before, document after, whether it splices]. The rest make the
// whole document render again.
const splices: [string, string, string, boolean][] = [
  [
    "a word typed into a paragraph",
    plainDocument,
    plainDocument.replace(paragraph30, paragraph30.replace("Text", "Texts")),
    true,
  ],
  ["paragraphs added at the top", plainDocument, `New.\n\nAnother.\n\n${plainDocument}`, true],
  ["a section removed", plainDocument, plainDocument.replace(plainSection(10), ""), true],
  [
    "a line that continues the paragraph above it",
    plainDocument,
    plainDocument.replace(paragraph30, `${paragraph30}\ncontinued`),
    true,
  ],
  [
    "an underline that makes the paragraph above it a heading",
    plainDocument,
    plainDocument.replace(paragraph30, `${paragraph30}\n---`),
    true,
  ],
  [
    "a table row",
    plainDocument,
    plainDocument.replace("| 30 | x |", "| 30 | x |\n| y | z |"),
    true,
  ],
  ["two paragraphs joined", "One\n\nTwo\n\nThree", "One\nTwo\n\nThree", true],
  ["a fence opened above everything", plainDocument, `\`\`\`\n${plainDocument}`, true],
  ["text added at the end", plainDocument, `${plainDocument}\nThe end.`, true],
  ["everything deleted", plainDocument, "", true],
  [
    "a link reference used",
    plainDocument,
    plainDocument.replace(paragraph30, `${paragraph30} See [ref].`),
    true,
  ],
  ["a raw HTML element opened above everything", plainDocument, `<div>\n\n${plainDocument}`, false],
  [
    "a heading added before others with its name",
    plainDocument,
    `## Part 5\n\n${plainDocument}`,
    false,
  ],
  [
    "a link reference defined",
    plainDocument,
    `${plainDocument}\n[ref]: https://example.com/ref`,
    false,
  ],
  [
    "a footnote reference to no definition typed",
    plainDocument,
    plainDocument.replace(paragraph30, `${paragraph30}[^1]`),
    true,
  ],
  [
    "a word typed into a paragraph of a document with footnotes",
    longDocument,
    longDocument.replace("a [link](https://example.com/30)", "a [linked](https://example.com/30)"),
    true,
  ],
  [
    "a paragraph added above footnote references",
    longDocument,
    longDocument.replace("## Part 30\n", "New.\n\n## Part 30\n"),
    true,
  ],
  [
    "a footnote referenced above its first reference",
    longDocument,
    longDocument.replace("## Part 3\n", "## Part 3\n\nSee [^40].\n"),
    false,
  ],
  [
    "a footnote definition edited",
    longDocument,
    longDocument.replace("Footnote 30.", "Footnote thirty."),
    false,
  ],
  [
    "a paragraph added where footnote definitions cite footnotes",
    orderSensitiveDocument,
    `${orderSensitiveDocument}\nMore.\n`,
    false,
  ],
];

test.each(splices)(
  "%s, spliced into the rendered document, adds up to its whole HTML and outline",
  (_name, before, after, splices) => {
    const previous = new Rendering();
    for (const _block of htmlBlocks(md, before, { headings: [] }, new Map(), previous));
    const env = { headings: [] };
    const spliced = spliceBlocks(md, after, env, previous);
    expect(spliced !== undefined).toBe(splices);
    const blocks = spliced?.blocks ?? [...htmlBlocks(md, after, env)];
    const parsedEnv = { headings: [] };
    expect(blocks.map((block) => block.html).join("")).toBe(
      md.renderer.render(md.parse(after, parsedEnv), md.options, parsedEnv),
    );
    expect(env.headings).toEqual(parsedEnv.headings);
  },
);

test("a splice keeps the pieces before the edit and moves the ones after it", () => {
  const previous = new Rendering();
  for (const _block of htmlBlocks(md, plainDocument, { headings: [] }, new Map(), previous));
  const edited = plainDocument.replace(paragraph30, `New paragraph.\n\n${paragraph30}`);
  const blocks = spliceBlocks(md, edited, { headings: [] }, previous)?.blocks ?? [];

  const edit = previous.blocks.findIndex((block) => block.source.includes(paragraph30));
  expect(blocks).toHaveLength(previous.blocks.length + 1);
  expect(blocks.slice(0, edit).every((block, index) => block === previous.blocks[index])).toBe(
    true,
  );
  const after = blocks.slice(edit + 1);
  expect(
    after.every((block, index) => block.rendersLike(previous.blocks[edit + index] as Block)),
  ).toBe(true);
});

test.each(edits)(
  "blocks reused across %s add up to the whole document's HTML and outline",
  (_name, before, after) => {
    const cache = blockCache(htmlBlocks(md, before, { headings: [] }));
    const env = { headings: [] };
    const blocks = [...htmlBlocks(md, after, env, cache)];
    const parsedEnv = { headings: [] };
    expect(blocks.map((block) => block.html).join("")).toBe(
      md.renderer.render(md.parse(after, parsedEnv), md.options, parsedEnv),
    );
    expect(env.headings).toEqual(parsedEnv.headings);
  },
);

// Whether an edit splices or renders the whole document again, the page ends up the same.
const allEdits = [
  ...edits,
  ...splices.map(([name, before, after]) => [`${name}, without footnotes`, before, after]),
];

test.each(allEdits)(
  "after %s, the page shows what rendering it afresh shows",
  async (_name, before, after) => {
    vi.useFakeTimers();
    tallBlocks();
    await render(before);
    await vi.runAllTimersAsync();
    await render(after);
    await vi.runAllTimersAsync();
    expect(article.innerHTML).toBe(renderedAllAtOnce(after));
  },
);

test.each(allEdits)(
  "after %s while the document before it was still rendering, the page shows what rendering it afresh shows",
  async (_name, before, after) => {
    vi.useFakeTimers();
    tallBlocks();
    await render(before);
    await render(after);
    await vi.runAllTimersAsync();
    expect(article.innerHTML).toBe(renderedAllAtOnce(after));
  },
);

test("an edit keeps the DOM of the blocks it didn't change, with their source lines moved", async () => {
  vi.useFakeTimers();
  await render(longDocument);
  await vi.runAllTimersAsync();
  const table = article.querySelectorAll("table")[30];
  const line = Number(table?.getAttribute("data-source-line"));

  await render(`Added.\n\n${longDocument}`);
  await vi.runAllTimersAsync();

  expect(article.querySelectorAll("table")[30]).toBe(table);
  expect(table?.getAttribute("data-source-line")).toBe(String(line + 2));
});
