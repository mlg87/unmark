// Keeps the reader's place when a reload re-renders the document (#24). Scroll offsets
// alone drift whenever content above the viewport changes height, so the anchor is a block
// (a direct child of the article) plus how far the viewport's top edge is into it.

export interface ScrollAnchor {
  /** The top-most block still visible, which a re-render keeps when its piece didn't change. */
  element: Element;
  /** Index of that block among the article's direct children. */
  index: number;
  /** That block's text, to find it again after blocks above it were added or removed. */
  text: string;
  /** How far the viewport's top edge is into that block, as a fraction of its height.
   *  Negative when the edge is in the margin above the block. */
  fraction: number;
}

/** Returns `null` when the page isn't scrolled, so a reload leaves it at the top. */
export function captureScrollAnchor(article: Element): ScrollAnchor | null {
  if (window.scrollY <= 0) return null;
  const blocks = article.children;
  // Blocks stack top to bottom, so the first one whose bottom is below the viewport's top is a
  // binary search: a long document has tens of thousands (unmark-1793451427066-4-97884ee7.1).
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((blocks[middle] as Element).getBoundingClientRect().bottom > 0) high = middle;
    else low = middle + 1;
  }
  const element = blocks[low];
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    element,
    index: low,
    text: element.textContent,
    fraction: rect.height > 0 ? -rect.top / rect.height : 0,
  };
}

/** Scrolls so the same point of the anchor's block is back at the viewport's top edge. */
export function restoreScrollAnchor(article: Element, anchor: ScrollAnchor): void {
  const block =
    anchor.element.parentElement === article ? anchor.element : findAnchorBlock(article, anchor);
  if (!block) return;
  const rect = block.getBoundingClientRect();
  window.scrollBy(0, rect.top + anchor.fraction * rect.height);
}

// How many blocks either side of the anchor's old index findAnchorBlock reads the text of. A
// re-render keeps the anchor's own element unless its block changed (index.ts), and then the
// text is usually gone too: reading every block's text of a 1 MB document took 40 ms of an
// edit's render (unmark-1793451427066-4-97884ee7.1).
const SEARCH_REACH = 64;

/** The block with the anchor's text closest to its old index. When that block was edited or
 *  removed, the block now at the old index stands in, or the last block if there are fewer. */
function findAnchorBlock(article: Element, anchor: ScrollAnchor): Element | undefined {
  const blocks = article.children;
  const reach = Math.min(SEARCH_REACH, Math.max(anchor.index, blocks.length - anchor.index));
  for (let distance = 0; distance <= reach; distance++) {
    for (const index of [anchor.index - distance, anchor.index + distance]) {
      const block = blocks[index];
      if (block?.textContent === anchor.text) return block;
    }
  }
  return blocks[Math.min(anchor.index, blocks.length - 1)];
}
