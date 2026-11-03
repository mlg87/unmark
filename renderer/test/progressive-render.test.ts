// @vitest-environment jsdom

// Long documents render in chunks (q47): the viewport's worth first, the rest in background
// tasks. Chunking must never change what the Preview ends up showing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "markdown-it";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";
import { type Block, blockCache, htmlBlocks, Rendering, spliceBlocks } from "../src/chunks.ts";
import type { Heading } from "../src/headings.ts";
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

test("a render that replaces one waiting for its next background task renders none of the old document", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await renderOnEmptyPage(longDocument);
  // Every markdown-it's block parser, the page's own among them.
  const parse = vi.spyOn(Object.getPrototypeOf(md.block), "parse");
  await render("# Replaced");
  await vi.runAllTimersAsync();
  // Rendering more of the old document would only delay the keystroke that replaced it
  // (unmark-1793451427066-4-97884ee7.9).
  expect(parse.mock.calls.filter(([src]) => String(src).includes("## Part"))).toEqual([]);
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
  expect(document.getElementById("user-content-part-30")).toBeNull();
  // No timers run, so no background task contributes to the scroll.
  await window.unmark.scrollToElement("part-30");
  expect(scrolledTo).toHaveBeenCalledWith("user-content-part-30");
  expect(document.getElementById("user-content-part-59")).toBeNull();
  // The background tasks carry on from where the scroll stopped.
  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(renderedAllAtOnce(longDocument));
});

test("a scroll whose element arrives while it waits its turn renders no further", async () => {
  vi.useFakeTimers();
  tallBlocks();
  Element.prototype.scrollIntoView = () => {};
  await renderOnEmptyPage(longDocument);
  expect(document.getElementById("user-content-part-20")).toBeNull();
  // The second call waits for the first, whose batch brings in part-20 too.
  await Promise.all([
    window.unmark.scrollToElement("part-30"),
    window.unmark.scrollToElement("part-20"),
  ]);
  expect(document.getElementById("user-content-part-59")).toBeNull();
});

test("following the Source to a line in a later chunk renders up to it, not the whole document", async () => {
  vi.useFakeTimers();
  tallBlocks();
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  await renderOnEmptyPage(longDocument);
  expect(document.getElementById("user-content-part-30")).toBeNull();
  await window.unmark.scrollToSourceLine(longDocument.split("\n").indexOf("## Part 30"));
  expect(document.getElementById("user-content-part-30")).not.toBeNull();
  expect(document.getElementById("user-content-part-59")).toBeNull();
});

test("scrolling near the end of the pieces on the page builds a screen past the viewport, not the whole document", async () => {
  // Fakes only setTimeout, so no background task runs while setImmediate lets the merge's
  // promises settle.
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  // Each of the article's blocks 100 px tall, so the first screen ends where it would on screen.
  let scrollY = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this === article) return new DOMRect(0, -scrollY, 100, article.children.length * 100);
    const index = Array.prototype.indexOf.call(article.children, this);
    return new DOMRect(0, index * 100 - scrollY, 100, 100);
  });
  const articleBottom = () => article.children.length * 100 - scrollY;
  await renderOnEmptyPage(longDocument);

  // The reader at the bottom of the first screen, before the background builds any further
  // (unmark-1793451427523-5-478d1806.6).
  scrollY = articleBottom() - window.innerHeight;
  window.dispatchEvent(new Event("scroll"));
  await new Promise((resolve) => setImmediate(resolve));

  expect(articleBottom()).toBeGreaterThanOrEqual(2 * window.innerHeight);
  expect(document.getElementById("user-content-part-59")).toBeNull();
  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(renderedAllAtOnce(longDocument));
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
  [
    "a paragraph between two indented code blocks deleted, joining them",
    "    a\n\nx\n\n    b\n",
    "    a\n\n\n\n    b\n",
    true,
  ],
  [
    "a table's delimiter row broken under the paragraph it interrupted",
    "123\n456\n| a | b |\n| --- | --- |\nd | e\n",
    "123\n456\n| a | b |\n| --- | -x- |\nd | e\n",
    true,
  ],
  [
    "a link reference definition after the last block broken",
    "Uses [ref].\n\n[ref]: /uri\n",
    "Uses [ref].\n\n[ref] /uri\n",
    false,
  ],
];

/** `markdown` rendered up to its `count`th piece, as a render still going in the background leaves it. */
function renderedUpTo(markdown: string, count: number): Rendering {
  const rendering = new Rendering();
  const pieces = htmlBlocks(md, markdown, { headings: [] }, new Map(), rendering);
  for (let piece = 0; piece < count && !pieces.next().done; piece++);
  return rendering;
}

/** The HTML of `after` rendered to the end as an edit of `previous`, spliced into it when it can be. */
function renderedEdit(after: string, env: Env, previous: Rendering): string {
  const spliced = spliceBlocks(md, after, env, previous);
  for (const _block of spliced?.rest ?? []);
  const blocks = spliced?.rendering.blocks ?? [
    ...htmlBlocks(md, after, env, blockCache(previous.blocks)),
  ];
  return blocks.map((block) => block.html).join("");
}

/** `markdown`'s HTML and outline, parsed and rendered whole. */
function renderedWhole(markdown: string): [string, Heading[]] {
  const env = { headings: [] };
  return [md.renderer.render(md.parse(markdown, env), md.options, env), env.headings];
}

test.each(splices)(
  "%s, spliced into the rendered document, adds up to its whole HTML and outline",
  (_name, before, after, splices) => {
    const previous = renderedUpTo(before, Number.POSITIVE_INFINITY);
    expect(spliceBlocks(md, after, { headings: [] }, previous) !== undefined).toBe(splices);
    const env = { headings: [] };
    expect([renderedEdit(after, env, previous), env.headings]).toEqual(renderedWhole(after));
  },
);

// A keystroke while the document is still rendering splices into the pieces rendered so far
// when it can, and the rest renders from that render's block parse
// (unmark-1793451427066-4-97884ee7.8).
test.each(splices)(
  "%s, spliced into the document while it's still rendering, adds up to its whole HTML and outline",
  (_name, before, after) => {
    const count = [...htmlBlocks(md, before, { headings: [] })].length;
    for (const rendered of new Set([1, count >> 1, count - 1])) {
      const env = { headings: [] };
      const html = renderedEdit(after, env, renderedUpTo(before, rendered));
      expect([rendered, html, env.headings]).toEqual([rendered, ...renderedWhole(after)]);
    }
  },
);

test("keystrokes into the pieces rendered so far never block-parse the whole document", () => {
  const previous = renderedUpTo(longDocument, 12);
  const parse = vi.spyOn(md.block, "parse");
  // A line added near the top moves the source lines of every piece after it, rendered or not.
  const typed = longDocument.replace("Hidden **markdown** 0.", "Hidden **markdown** 0.\n\nNew.");
  const first = spliceBlocks(md, typed, { headings: [] }, previous);
  expect(first?.rest).toBeDefined();
  first?.rest?.next();
  first?.rest?.next();
  // The next keystroke lands while the rest of the first one's pieces still render.
  const retyped = typed.replace("## Part 0", "## Part zero");
  const env = { headings: [] };
  const second = spliceBlocks(md, retyped, env, first?.rendering as Rendering);
  for (const _block of second?.rest ?? []);
  expect(parse).not.toHaveBeenCalled();
  const html = (second?.rendering.blocks ?? []).map((block) => block.html).join("");
  expect([html, env.headings]).toEqual(renderedWhole(retyped));
});

test("an edit past the pieces rendered so far renders the whole document again", () => {
  const previous = renderedUpTo(longDocument, 3);
  const edited = longDocument.replace("Hidden **markdown** 40.", "Hidden **markdown** forty.");
  expect(spliceBlocks(md, edited, { headings: [] }, previous)).toBeUndefined();
});

// Random edits, seeded so a failure repeats: what any edit splices into, or renders again in
// full, must add up to what rendering the edited document afresh gives, whether the document
// before it had rendered or was still rendering, a seeded number of pieces in.
test("seeded random edits to the spec examples render as the edited documents do", () => {
  const examples = ["spec.txt", "extensions.txt"].flatMap((file) =>
    parseSpecExamples(file, readFileSync(join(import.meta.dirname, "fixtures", file), "utf8")),
  );
  const insertions = ["x", "\n", "\n\n", "- ", "> ", "```", "---", "===", "| a |", "    ", "[^1]"];
  let seed = 47;
  const random = (below: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % below;
  };
  for (let first = 0; first < examples.length; first += 8) {
    const before = examples
      .slice(first, first + 8)
      .map(({ markdown }) => markdown)
      .join("\n");
    const rendered = renderedUpTo(before, Number.POSITIVE_INFINITY);
    for (let edit = 0; edit < 4; edit++) {
      const at = random(before.length + 1);
      const after =
        random(3) === 0
          ? before.slice(0, at) + before.slice(at + 1 + random(20))
          : before.slice(0, at) + insertions[random(insertions.length)] + before.slice(at);
      const rendering = renderedUpTo(before, 1 + random(rendered.blocks.length));
      for (const previous of [rendered, rendering]) {
        const env = { headings: [] };
        expect([
          after,
          previous.complete,
          renderedEdit(after, env, previous),
          env.headings,
        ]).toEqual([after, previous.complete, ...renderedWhole(after)]);
      }
    }
  }
});

test("a splice keeps the pieces before the edit and moves the ones after it", () => {
  const previous = renderedUpTo(plainDocument, Number.POSITIVE_INFINITY);
  const edited = plainDocument.replace(paragraph30, `New paragraph.\n\n${paragraph30}`);
  const blocks = spliceBlocks(md, edited, { headings: [] }, previous)?.rendering.blocks ?? [];

  const edit = previous.blocks.findIndex((block) => block.source.includes(paragraph30));
  expect(blocks).toHaveLength(previous.blocks.length + 1);
  // The heading right above parses again: the line after it, which ended it, changed.
  const kept = blocks.slice(0, edit - 1);
  expect(kept.every((block, index) => block === previous.blocks[index])).toBe(true);
  expect(blocks[edit - 1]?.rendersLike(previous.blocks[edit - 1] as Block)).toBe(true);
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

test("an edit's DOM build-out waits for a gap in the typing", async () => {
  vi.useFakeTimers();
  tallBlocks();
  await renderOnEmptyPage(longDocument);
  const edited = `Edited.\n\n${longDocument}`;
  await render(edited);
  const onPage = article.innerHTML;

  // Long enough for the edit to render the rest of its pieces, short of the typing pause: the
  // layout each inserted piece costs is what a keystroke would wait for
  // (unmark-1793451427066-4-97884ee7.5).
  await vi.advanceTimersByTimeAsync(1000);
  expect(article.innerHTML).toBe(onPage);

  await vi.runAllTimersAsync();
  expect(article.innerHTML).toBe(renderedAllAtOnce(edited));
});

test("a keystroke while a long document is still rendering block-parses only what it changed", async () => {
  vi.useFakeTimers();
  tallBlocks();
  // Each background task renders one piece, so the open is still rendering when the reader types.
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => (now += 20));
  await renderOnEmptyPage(longDocument);
  await vi.advanceTimersToNextTimerAsync();
  // Every markdown-it's block parser, the page's own among them.
  const parse = vi.spyOn(Object.getPrototypeOf(md.block), "parse");
  const edited = longDocument.replace("## Part 0\n", "## Part 0\n\nNew.\n");
  await render(edited);
  await vi.runAllTimersAsync();
  expect(parse).not.toHaveBeenCalled();
  expect(article.innerHTML).toBe(renderedAllAtOnce(edited));
});
