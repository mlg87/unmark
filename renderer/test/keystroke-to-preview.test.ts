// @vitest-environment jsdom

// q47: typing in the Source of a 1 MB file updates the Preview in under 250 ms. The app's
// `keystroke-to-preview` signpost needs Instruments, so this times the renderer's share of it,
// a render's first screen, on the renderer's own entry point with the whole document on the
// page (unmark-1793451427066-4-97884ee7.10).

import { beforeAll, expect, test, vi } from "vitest";
import "../src/index.ts";

const KEYSTROKE_TO_PREVIEW_MS = 250;
// App/DocumentWindow.swift's editRenderDebounce: how long the app waits after a keystroke
// before it asks for the render.
const EDIT_RENDER_DEBOUNCE_MS = 40;
// Every top-level block's height in the layout model below.
const BLOCK_HEIGHT = 100;

const section = (n: number) => `## Part ${n}

Text with a [link](https://example.com/${n}), www.example.com, and more words here.

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

Another paragraph ${n} with **bold** and _emphasis_ and \`code\`.
`;

let megabyteDocument = "";
for (let n = 0; megabyteDocument.length < 1_000_000; n++) megabyteDocument += `${section(n)}\n`;

let article: Element;
let scrollY = 0;

// jsdom lays nothing out, so each top-level block gets a fixed height, as the bead's
// measurement did: the first screen then ends where it would on screen. The positions are
// recomputed only after the article's children change, so the model itself stays cheap.
const indexOfBlock = new Map<Element, number>();
let layoutStale = true;
const layoutChanges = new MutationObserver(() => {
  layoutStale = true;
});

function blockIndex(block: Element): number {
  if (layoutChanges.takeRecords().length > 0) layoutStale = true;
  if (layoutStale) {
    indexOfBlock.clear();
    let index = 0;
    for (let child = article.firstElementChild; child; child = child.nextElementSibling) {
      indexOfBlock.set(child, index++);
    }
    layoutStale = false;
  }
  return indexOfBlock.get(block) ?? indexOfBlock.size;
}

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
  layoutChanges.observe(article, { childList: true });
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(window, "scrollBy").mockImplementation(((_x: number, y: number) => {
    scrollY = Math.max(0, scrollY + y);
  }) as typeof window.scrollBy);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this === article) {
      return new DOMRect(0, -scrollY, 100, blockIndex(article) * BLOCK_HEIGHT);
    }
    let block: Element | null = this;
    while (block && block.parentElement !== article) block = block.parentElement;
    const top = (block ? blockIndex(block) : 0) * BLOCK_HEIGHT;
    return new DOMRect(0, top - scrollY, 100, BLOCK_HEIGHT);
  });
});

test("typing in a 1 MB document shows the edit in the Preview within q47's budget", async () => {
  expect(megabyteDocument.length).toBeGreaterThanOrEqual(1_000_000);
  await window.unmark.render(megabyteDocument, { documentBaseURL: "file:///" });
  // The whole document on the page, as after the reader has had it open a moment.
  await window.unmark.outline();

  const edited = "Another paragraph 1200";
  const paragraph = [...article.children].find((block) => block.textContent?.startsWith(edited));
  expect(paragraph).toBeDefined();
  scrollY = blockIndex(paragraph as Element) * BLOCK_HEIGHT - 300;

  let text = megabyteDocument;
  const caret = text.indexOf(edited) + edited.length;
  const durations: number[] = [];
  for (let typed = 0; typed < 5; typed++) {
    text = `${text.slice(0, caret + typed)}x${text.slice(caret + typed)}`;
    const start = performance.now();
    await window.unmark.render(text, { documentBaseURL: "file:///" });
    durations.push(performance.now() - start);
  }

  const typedIn = `${edited}xxxxx with`;
  expect([...article.children].some((block) => block.textContent?.startsWith(typedIn))).toBe(true);
  // Every keystroke, the first after the document finished rendering included: it's the one
  // that would read the whole page's source-line markers if they weren't read as they landed.
  const rounded = durations.map(Math.round).join(", ");
  expect(Math.max(...durations), `keystroke to first screen: ${rounded} ms`).toBeLessThan(
    KEYSTROKE_TO_PREVIEW_MS - EDIT_RENDER_DEBOUNCE_MS,
  );
}, 120_000);
