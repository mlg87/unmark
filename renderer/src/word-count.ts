// The status bar's word count (unmark-1793451440089-32-11f0a691, q35): the words a reader sees
// in the Preview, not the markdown syntax around them, and not the front-matter table.
//
// A part's words are counted once, on the part whose HTML it is: an edit renders one block or
// a few and moves the rest (chunks.ts), so counting after a keystroke reads only the changed
// blocks' text.

import type { Block, BlockPart } from "./chunks.ts";
import { sanitizeEach } from "./sanitize.ts";

// HTML characters sanitized at a time, and how long counting runs before yielding, so a 1 MB
// document's first count doesn't block scrolling or typing. Sanitizing 32 KB took about 90 ms
// in Chromium, three times index.ts's 30 ms background task, so a batch is a quarter of that.
const CHUNK = 8 * 1024;
const TASK_MS = 30;

const segmenter = new Intl.Segmenter("en", { granularity: "word" });
const partWords = new WeakMap<BlockPart, number>();

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
    const batch: BlockPart[] = [];
    for (let length = 0; next < parts.length && length < CHUNK; next++) {
      const part = parts[next] as BlockPart;
      batch.push(part);
      length += part.html.length;
    }
    const texts = renderedTexts(batch.map((part) => part.html));
    batch.forEach((part, index) => {
      partWords.set(part, countWords(texts[index] as string));
    });
  }

  let total = 0;
  for (const block of blocks) {
    for (const { origin } of block.parts) total += partWords.get(origin) ?? 0;
    // The footnotes section is rendered anew with every render, so it's counted every time.
    if (block.footnotes) total += countWords(renderedTexts([block.footnotes])[0] as string);
  }
  return total;
}

/**
 * The text of each of `htmls` as the Preview shows it: sanitized, as the page inserts it, so
 * raw HTML the sanitizer drops doesn't count.
 */
function renderedTexts(htmls: readonly string[]): string[] {
  return sanitizeEach(htmls).map((fragment) => {
    // Only screen readers read it: the footnotes section's "Footnotes" heading.
    for (const hidden of fragment.querySelectorAll(".sr-only")) hidden.remove();
    return fragment.textContent ?? "";
  });
}
