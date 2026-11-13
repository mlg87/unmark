// Puts a render's pieces (chunks.ts) on the page, keeping the DOM of the pieces the page
// already shows (unmark-1793451427066-4-97884ee7.1). Tearing down a 1 MB document's DOM
// takes WebKit up to 1.9 s, and replacing it redraws every diagram, while an edit changes
// one piece or a few and moves the source-line markers of the pieces after it.
//
// The merge walks the new pieces in order next to the old ones. A new piece with the same
// lines as the next old piece, or as one shortly after it, lines up with it, and the old
// pieces in between go; the blank lines above a piece don't count, so a Return above it
// doesn't take it for another (unmark-1793451427066-4-97884ee7.7). One that lines up and
// renders alike keeps its DOM, with its markers moved; any other gets new DOM. Until the merge
// reaches them, the old pieces stay on the page below the new ones, as a long document's
// pieces not yet rendered stay off it.

import type { Block } from "./chunks.ts";
import { sanitizeEach } from "./sanitize.ts";
import { SOURCE_LINE } from "./source-lines.ts";

/** A piece on the page and the article's child nodes it rendered to. */
export interface PageBlock {
  readonly block: Block;
  readonly nodes: readonly ChildNode[];
}

// How many old pieces a new piece may skip to line up with a later one on its own. Farther,
// the piece after it must line up too, so a common piece (a rule, a repeated line) far below
// doesn't remove every piece in between.
const NEAR = 4;
// Pieces a step keeps after lining them up before the caller's check, so a background task
// stays short. Pieces the page shows as they are cost nothing and don't count.
const KEPT_PER_STEP = 512;
// The one range every removal goes through. WebKit updates every live range on each change to
// the DOM, and a range stays live until it's collected: with a range per removal, hundreds of
// them made inserting and removing pieces 1.2 s of the 1.7 s a 1 MB document replacing another
// took to its first screen, and 0.06 s with this one (unmark-1793451427523-5-478d1806.9). Each
// removal leaves it at the document's start rather than in the article: left where it removed
// pieces, inserting a 1 MB document's build-out took 3.4 s in WKWebView rather than 0.25 s
// (unmark-1793451427523-5-478d1806.12).
const REMOVAL = document.createRange();

/** Where a new piece goes; `undefined` for the old piece the page shows, kept as it is. */
type Placement =
  | {
      block: Block;
      /** The old piece it lines up with. */
      old: number | undefined;
      /** Whether it keeps that piece's DOM. */
      keep: boolean;
    }
  | undefined;

export class BlockMerge {
  readonly #article: Element;
  #old: readonly PageBlock[];
  readonly #blocks: Iterator<Block>;
  readonly #isCurrent: () => boolean;
  readonly #drawDiagrams: (containers: Element[]) => Promise<void>;
  readonly #merged: PageBlock[] = [];
  /** The first old piece the merge hasn't reached; the ones before it are kept or removed. */
  #cursor = 0;
  #peeked: Block | undefined;
  #blocksDone = false;
  #complete = false;
  #oldByText: Map<string, number[]> | undefined;
  #lastCall: Promise<void> = Promise.resolve();

  constructor(
    article: Element,
    old: readonly PageBlock[],
    blocks: Iterator<Block>,
    isCurrent: () => boolean,
    drawDiagrams: (containers: Element[]) => Promise<void>,
  ) {
    this.#article = article;
    this.#old = old;
    this.#blocks = blocks;
    this.#isCurrent = isCurrent;
    this.#drawDiagrams = drawDiagrams;
  }

  /** True once every piece is on the page and the old ones are gone, or a newer render replaced this one. */
  get done(): boolean {
    return this.#complete || !this.#isCurrent();
  }

  /** The pieces on the page, in order: the merged ones, then the old ones not reached yet. */
  onPage(): PageBlock[] {
    return this.#merged.concat(this.#old.slice(this.#cursor));
  }

  /** The line the last merged piece starts on, or -1 before the first. */
  get mergedLine(): number {
    return this.#merged.at(-1)?.block.line ?? -1;
  }

  /** Whether `node` is in a merged piece rather than an old one the merge hasn't reached. */
  isMerged(node: Node): boolean {
    const boundary = this.#firstOldNode();
    return (
      boundary === null ||
      (boundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    );
  }

  /** Whether the merged pieces reach `bottom`, in CSS pixels below the viewport's top edge. */
  reaches(bottom: number): boolean {
    const boundary = this.#firstOldElement();
    const end = boundary
      ? boundary.getBoundingClientRect().top
      : this.#article.getBoundingClientRect().bottom;
    return end >= bottom;
  }

  /**
   * Merges pieces a step at a time, each with new DOM for at least `chunkLength` characters of
   * HTML unless the document ends, until `enough()` holds. `enough` is asked first, when this
   * call's turn comes, since earlier calls may have merged what it needed. Calls run one at a
   * time, so the pieces land in order.
   */
  advanceUntil(enough: () => boolean, chunkLength: number): Promise<void> {
    const call = this.#lastCall.then(async () => {
      while (!this.done && !enough()) await this.#step(chunkLength);
    });
    // A call that failed (a lazy chunk that didn't load) mustn't block the ones after it.
    this.#lastCall = call.catch(() => {});
    return call;
  }

  /**
   * Removes the old pieces after the last one that has the text of any of `blocks`, the render's
   * every piece, without waiting for the merge to reach them: no piece lines up with them, so
   * the merge would only remove them once it ends. Every piece merged until then went in above
   * them, and inserting above an old piece takes WebKit longer to lay out than adding at the
   * end: a 1 MB document replacing another, which left one old piece at the bottom, took 14.2 s
   * to build out in WKWebView rather than 12.4 s (unmark-1793451427523-5-478d1806.12).
   */
  removeOldTail(blocks: readonly Block[]): Promise<void> {
    const call = this.#lastCall.then(() => {
      if (this.done || this.#cursor === this.#old.length) return;
      const texts = new Set<string>();
      for (const block of blocks) texts.add(block.text);
      let end = this.#old.length;
      while (end > this.#cursor && !texts.has((this.#old[end - 1] as PageBlock).block.text)) end--;
      this.#remove(end, this.#old.length);
      this.#old = this.#old.slice(0, end);
    });
    this.#lastCall = call.catch(() => {});
    return call;
  }

  async #step(chunkLength: number): Promise<void> {
    const placements: Placement[] = [];
    const fresh: Block[] = [];
    let freshLength = 0;
    let moved = 0;
    let cursor = this.#cursor;
    while (freshLength < chunkLength && moved < KEPT_PER_STEP) {
      const block = this.#next();
      if (!block) break;
      // A piece a splice kept as it was (chunks.ts) is the very piece on the page.
      if (this.#old[cursor]?.block === block) {
        placements.push(undefined);
        cursor++;
        continue;
      }
      const old = this.#lineUp(block, cursor);
      const keep = old !== undefined && block.rendersLike((this.#old[old] as PageBlock).block);
      placements.push({ block, old, keep });
      if (old !== undefined) cursor = old + 1;
      if (keep) {
        moved++;
        continue;
      }
      fresh.push(block);
      freshLength += block.html.length;
    }

    const fragments = await fragmentsOf(fresh);
    // A newer render may have started while KaTeX loaded; it merges from the page as it is.
    if (!this.#isCurrent()) return;
    const containers: Element[] = [];
    let nextFragment = 0;
    for (const placement of placements) {
      if (!placement) {
        this.#merged.push(this.#old[this.#cursor++] as PageBlock);
        continue;
      }
      const { block, old, keep } = placement;
      if (old !== undefined) {
        this.#remove(this.#cursor, keep ? old : old + 1);
        this.#cursor = old + 1;
      }
      if (keep) {
        const kept = this.#old[old as number] as PageBlock;
        if (block.movable) moveMarkers(kept.nodes, block.textLine - kept.block.textLine);
        this.#merged.push({ block, nodes: kept.nodes });
        continue;
      }
      const fragment = fragments[nextFragment++] as DocumentFragment;
      containers.push(...fragment.querySelectorAll(".mermaid-diagram"));
      const nodes = [...fragment.childNodes];
      this.#article.insertBefore(fragment, this.#firstOldNode());
      this.#merged.push({ block, nodes });
    }
    if (this.#blocksDone && this.#peeked === undefined) {
      this.#remove(this.#cursor, this.#old.length);
      this.#cursor = this.#old.length;
      this.#complete = true;
    }
    if (containers.length > 0) await this.#drawDiagrams(containers);
  }

  /** The old piece `block` lines up with, at or after `cursor`. */
  #lineUp(block: Block, cursor: number): number | undefined {
    // Most edits change a piece or two, so the old piece is the next one or nearly.
    for (let index = cursor; index <= cursor + NEAR && index < this.#old.length; index++) {
      if (this.#old[index]?.block.text === block.text) return index;
    }
    const later = this.#nextOldWithText(block.text, cursor);
    if (later === undefined) return undefined;
    const next = this.#peek();
    const oldNext = this.#old[later + 1]?.block;
    if (next === undefined ? oldNext === undefined : oldNext?.text === next.text) return later;
    return undefined;
  }

  #nextOldWithText(text: string, cursor: number): number | undefined {
    if (!this.#oldByText) {
      this.#oldByText = new Map();
      this.#old.forEach(({ block }, index) => {
        const indices = this.#oldByText?.get(block.text);
        if (indices) indices.push(index);
        else this.#oldByText?.set(block.text, [index]);
      });
    }
    const indices = this.#oldByText.get(text);
    if (!indices) return undefined;
    // The first index after `cursor`; indices ascend.
    let low = 0;
    let high = indices.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((indices[middle] as number) <= cursor) low = middle + 1;
      else high = middle;
    }
    return indices[low];
  }

  #next(): Block | undefined {
    const block = this.#peek();
    this.#peeked = undefined;
    return block;
  }

  #peek(): Block | undefined {
    if (this.#peeked || this.#blocksDone) return this.#peeked;
    const result = this.#blocks.next();
    if (result.done) this.#blocksDone = true;
    else this.#peeked = result.value;
    return this.#peeked;
  }

  /** Removes the DOM of old pieces `from` up to `to`, in one mutation: they're contiguous. */
  #remove(from: number, to: number): void {
    if (from >= to) return;
    const nodes = this.#old.slice(from, to).flatMap(({ nodes }) => nodes);
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first || !last) return;
    REMOVAL.setStartBefore(first);
    REMOVAL.setEndAfter(last);
    REMOVAL.deleteContents();
    REMOVAL.setStart(document, 0);
    REMOVAL.collapse(true);
  }

  #firstOldNode(): ChildNode | null {
    for (let index = this.#cursor; index < this.#old.length; index++) {
      const first = this.#old[index]?.nodes[0];
      if (first) return first;
    }
    return null;
  }

  #firstOldElement(): Element | undefined {
    for (let index = this.#cursor; index < this.#old.length; index++) {
      const element = this.#old[index]?.nodes.find((node) => node.nodeType === Node.ELEMENT_NODE);
      if (element) return element as Element;
    }
    return undefined;
  }
}

/** Sanitized, ready-to-insert DOM for each of `blocks`. */
async function fragmentsOf(blocks: Block[]): Promise<DocumentFragment[]> {
  if (blocks.length === 0) return [];
  // Documents are untrusted: nothing markdown-it emits reaches the DOM unsanitized (#15).
  const fragments = sanitizeEach(blocks.map((block) => block.html));
  // KaTeX is a lazy chunk only documents with math load (unmark-1793451433078-17-487f189f).
  // Its output is built after sanitizing, from TeX that was sanitized as text.
  if (fragments.some((fragment) => fragment.querySelector(".math"))) {
    const { renderMath } = await import("./math.ts");
    for (const fragment of fragments) renderMath(fragment);
  }
  return fragments;
}

/** Moves the source-line markers in `nodes` `delta` lines down. */
function moveMarkers(nodes: readonly ChildNode[], delta: number): void {
  if (delta === 0) return;
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    for (const marked of [element, ...element.querySelectorAll(`[${SOURCE_LINE}]`)]) {
      const line = marked.getAttribute(SOURCE_LINE);
      if (line !== null) marked.setAttribute(SOURCE_LINE, String(Number(line) + delta));
    }
  }
}
