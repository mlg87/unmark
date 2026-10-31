// Keeps the reader's place when a reload re-renders the document (#24). Scroll offsets
// alone drift whenever content above the viewport changes height, so the anchor is a block
// (a direct child of the article) plus how far the viewport's top edge is into it.

export interface ScrollAnchor {
  /** Index of the top-most block still visible, among the article's direct children. */
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
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index] as Element;
    const rect = block.getBoundingClientRect();
    if (rect.bottom > 0) {
      return {
        index,
        text: block.textContent,
        fraction: rect.height > 0 ? -rect.top / rect.height : 0,
      };
    }
  }
  return null;
}

/** Scrolls so the same point of the anchor's block is back at the viewport's top edge. */
export function restoreScrollAnchor(article: Element, anchor: ScrollAnchor): void {
  const block = findAnchorBlock(article, anchor);
  if (!block) return;
  const rect = block.getBoundingClientRect();
  window.scrollBy(0, rect.top + anchor.fraction * rect.height);
}

/** The block with the anchor's text closest to its old index. When that block was edited or
 *  removed, the block now at the old index stands in, or the last block if there are fewer. */
function findAnchorBlock(article: Element, anchor: ScrollAnchor): Element | undefined {
  const blocks = article.children;
  const reach = Math.max(anchor.index, blocks.length - anchor.index);
  for (let distance = 0; distance <= reach; distance++) {
    for (const index of [anchor.index - distance, anchor.index + distance]) {
      const block = blocks[index];
      if (block?.textContent === anchor.text) return block;
    }
  }
  return blocks[Math.min(anchor.index, blocks.length - 1)];
}
