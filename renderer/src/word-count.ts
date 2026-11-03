// The status bar's word count (unmark-1793451440089-32-11f0a691, q35): the words a reader sees
// in the Preview, not the markdown syntax around them, and not the front-matter table.
//
// A part's words are counted once, on the part whose HTML it is: an edit renders one block or
// a few and moves the rest (chunks.ts), so counting after a keystroke reads only the changed
// blocks' text.

import type { Block, BlockPart } from "./chunks.ts";
import { sanitize, sanitizeEach } from "./sanitize.ts";

// HTML characters counted at a time, and how long counting runs before yielding, so a 1 MB
// document's first count doesn't block scrolling or typing. Sanitizing 32 KB of raw HTML took
// about 90 ms in Chromium, three times index.ts's 30 ms background task, so a batch is a
// quarter of that.
const CHUNK = 8 * 1024;
const TASK_MS = 30;

const segmenter = new Intl.Segmenter("en", { granularity: "word" });
const partWords = new WeakMap<BlockPart, number>();
let parser: HTMLTemplateElement | undefined;
// Separates the parts parsedTexts() parses together. Without raw HTML, no part can write it.
const PART_BREAK = "unmark-part-break";

/** The words in `text`: its word-like segments, so punctuation and spaces don't count. */
export function countWords(text: string): number {
  let count = 0;
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) count++;
  return count;
}

/**
 * The words in `blocks` as the Preview shows them, or `undefined` once `isCurrent()` turns
 * false: counting yields between chunks, and a newer render makes this count stale.
 */
export async function countRenderedWords(
  blocks: readonly Block[],
  isCurrent: () => boolean,
): Promise<number | undefined> {
  const uncounted = new Set<BlockPart>();
  for (const block of blocks) {
    for (const { origin } of block.parts) {
      if (!origin.frontMatter && !partWords.has(origin)) uncounted.add(origin);
    }
  }
  const parts = [...uncounted];
  for (let next = 0, deadline = performance.now() + TASK_MS; next < parts.length; ) {
    if (performance.now() >= deadline) {
      await new Promise((resolve) => setTimeout(resolve));
      if (!isCurrent()) return undefined;
      deadline = performance.now() + TASK_MS;
    }
    const plain: BlockPart[] = [];
    const withRawHtml: BlockPart[] = [];
    for (let length = 0; next < parts.length && length < CHUNK; next++) {
      const part = parts[next] as BlockPart;
      (part.rawHtml.length > 0 ? withRawHtml : plain).push(part);
      length += part.html.length;
    }
    const plainTexts = parsedTexts(plain.map((part) => part.html));
    plain.forEach((part, index) => {
      partWords.set(part, countWords(plainTexts[index] as string));
    });
    if (withRawHtml.length === 0) continue;
    // Sanitized, as the page inserts it, so raw HTML the sanitizer drops doesn't count.
    const fragments = sanitizeEach(withRawHtml.map((part) => part.html));
    withRawHtml.forEach((part, index) => {
      partWords.set(part, countWords(visibleText(fragments[index] as DocumentFragment)));
    });
  }

  let total = 0;
  for (const block of blocks) {
    for (const { origin } of block.parts) total += partWords.get(origin) ?? 0;
    // The footnotes section is rendered anew with every render, so it's counted every time.
    // Its definitions can hold raw HTML.
    if (block.footnotes) total += countWords(visibleText(sanitize(block.footnotes)));
  }
  return total;
}

/**
 * The text of markdown-it's own HTML, without raw HTML in it (unmark-1793451427523-5-478d1806.4).
 * Everything markdown-it and its plugins emit is on the sanitizer's allowlist (sanitize.ts), so
 * the sanitizer drops none of its text, and parsing it inertly reads the same text as sanitizing
 * it at a fraction of the cost: sanitizing a 1 MB document a second time, apart from the merge,
 * kept its first count back for seconds.
 */
function parsedTexts(htmls: readonly string[]): string[] {
  if (htmls.length === 0) return [];
  parser ??= document.createElement("template");
  parser.innerHTML = htmls.join(`<${PART_BREAK}></${PART_BREAK}>`);
  const texts = [""];
  for (const node of parser.content.childNodes) {
    if (node.nodeName.toLowerCase() === PART_BREAK) texts.push("");
    else texts[texts.length - 1] += node.textContent ?? "";
  }
  if (texts.length === htmls.length) return texts;
  // A part left an element open, so the parser nested a break in it: parse each on its own.
  return htmls.map((html) => parsedTexts([html])[0] as string);
}

function visibleText(fragment: DocumentFragment): string {
  // Only screen readers read it: the footnotes section's "Footnotes" heading.
  for (const hidden of fragment.querySelectorAll(".sr-only")) hidden.remove();
  return fragment.textContent ?? "";
}
