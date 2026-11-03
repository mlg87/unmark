// Parses and renders a document a top-level block at a time, so the Preview shows the top
// of a long document before the rest is parsed (q47: a 1 MB file opens in under 1 s).
// Concatenated, the pieces equal `md.render()`'s output.
//
// `md.parse()` runs each core rule over the whole document in turn. Only the block rules
// need the whole document (link reference and footnote definitions can come after their
// uses), and they're about a fifth of the parse. The inline rule and the rules after it
// only read and rewrite tokens within a block, so they run here one block at a time, in
// document order, which keeps what depends on order (footnote numbers, heading ids, the
// outline) the same. footnote_tail is the exception: it gathers every footnote definition
// into a section at the end, so it runs once, after the last block.
//
// A render reuses the blocks of the render before it (unmark-1793451427066-4-97884ee7.1):
// inline-parsing and rendering every block of a 1 MB document takes longer than q47's
// 250 ms from keystroke to Preview, and an edit changes one block or a few. A top-level
// block's tokens depend only on its own lines, so its HTML depends only on them, the line
// they start on (its source-line markers), the link references it looks up, the ids its
// headings get, and the numbers its footnote references get; the last two depend on the
// blocks before it. A block reuses an earlier rendering of the same lines when its references
// still resolve and its headings and footnote references still get the same ids and numbers,
// with its markers moved to the lines it starts on now. When it can, an edit also skips the
// block parse of the blocks it can't have changed (spliceBlocks), even while the rendering it
// edits is still being rendered: the pieces after the rendered ones then render from the block
// tokens of that rendering's parse (unmark-1793451427066-4-97884ee7.8).

import type { Env, MarkdownIt, StateBlock, StateCore, Token } from "markdown-it";
import {
  defineFootnotes,
  type FootnoteUse,
  footnoteLabels,
  footnoteUse,
  retakeFootnotes,
} from "./footnotes.ts";
import { type Heading, type HeadingIds, headingIdsFor, type RenderEnv } from "./headings.ts";
import { SOURCE_LINE } from "./source-lines.ts";

/** What a link reference label resolves to; `undefined` when the document doesn't define it. */
type Reference = { href: string; title: string } | undefined;

/** A document's link reference definitions, by label. */
type Definitions = NonNullable<Env["references"]>;

/** What reusing a block's rendering depends on beyond its lines, and what it adds to the render. */
export interface BlockContext {
  /** The link references the block looked up, and what each resolved to. */
  readonly lookups: readonly (readonly [string, Reference])[];
  /** The ids its headings took: each heading's slug and the id it got. */
  readonly ids: readonly (readonly [string, string])[];
  /** The outline entries its headings added. */
  readonly outline: readonly Heading[];
  /** Its footnote references. */
  readonly footnotes: FootnoteUse;
}

/** Earlier renderings of top-level blocks, by their lines. */
export type BlockCache = ReadonlyMap<string, BlockPart>;

// An inline footnote, `^[text]`, whose text renders in the footnotes section.
const INLINE_FOOTNOTE = "^[";
const FOOTNOTE_SYNTAX = /\[\^|\^\[/g;
const MARKER = new RegExp(` ${SOURCE_LINE}="(\\d+)"`, "g");
// A line markdown-it's block parse skips: spaces and tabs at most.
const BLANK_LINE = /[ \t]*\n/y;

/** A top-level block's rendering. */
export class BlockPart {
  /**
   * The block's lines, each with its line break, from where the block before it ended: the
   * blank lines and link reference definitions above it count as its own.
   */
  readonly source: string;
  /** The 0-based line `source` starts on. */
  readonly line: number;
  /** The line after the block's last, where the parse decided it ended. */
  readonly end: number;
  /**
   * What reusing this rendering depends on, or `undefined` when it depends on more: an inline
   * footnote's text renders in the footnotes section, and raw HTML's own source-line markers
   * don't move with the block.
   */
  readonly context: BlockContext | undefined;
  /** The block's raw HTML, which decides whether the blocks after it join its piece. */
  readonly rawHtml: readonly string[];
  /**
   * Whether every source-line marker in the HTML is one of the block's own, so moving the
   * block moves them all by as many lines. Raw HTML can write the attribute itself.
   */
  readonly movable: boolean;
  /** The part whose rendering this one reuses, or this one if it rendered its own. */
  readonly origin: BlockPart;
  /** Whether the block is the document's YAML front matter, which the word count leaves out (q35). */
  readonly frontMatter: boolean;
  #html: string | undefined;

  constructor(
    source: string,
    [line, end]: [number, number],
    context: BlockContext | undefined,
    rawHtml: readonly string[],
    rendering: string | BlockPart,
    frontMatter = false,
  ) {
    this.source = source;
    this.line = line;
    this.end = end;
    this.context = context;
    this.rawHtml = rawHtml;
    this.movable =
      typeof rendering === "string" ? !source.includes(SOURCE_LINE) : rendering.movable;
    this.origin = typeof rendering === "string" ? this : rendering;
    this.frontMatter = typeof rendering === "string" ? frontMatter : rendering.frontMatter;
    this.#html = typeof rendering === "string" ? rendering : undefined;
  }

  get html(): string {
    this.#html ??= moveMarkers(this.origin.html, this.line - this.origin.line);
    return this.#html;
  }

  /** This rendering for the same lines starting at `line`. */
  movedTo(line: number): BlockPart {
    if (line === this.line) return this;
    const span: [number, number] = [line, this.end + line - this.line];
    return new BlockPart(this.source, span, this.context, this.rawHtml, this.origin);
  }
}

/**
 * A piece of the document that can be sanitized on its own: a top-level block, or the blocks
 * inside a raw HTML element the document leaves open across them. The last piece ends with the
 * footnotes section.
 */
export class Block {
  /** The piece's lines, its blocks' lines together. */
  readonly source: string;
  /** The 0-based line `source` starts on, or the line count for the footnotes section alone. */
  readonly line: number;
  readonly parts: readonly BlockPart[];
  /** Whether moving the piece moves every source-line marker in it by as many lines. */
  readonly movable: boolean;
  /** Whether its HTML is its parts' alone, each reusable. */
  readonly reusable: boolean;
  readonly #footnotes: string;
  #html: string | undefined;
  #textStart: { text: string; line: number } | undefined;

  constructor(source: string, line: number, parts: readonly BlockPart[], footnotes = "") {
    this.source = source;
    this.line = line;
    this.parts = parts;
    this.movable = !footnotes && parts.every((part) => part.movable);
    this.reusable = !footnotes && parts.every((part) => part.context !== undefined);
    this.#footnotes = footnotes;
  }

  /** The line after the piece's last. */
  get end(): number {
    return this.parts.at(-1)?.end ?? this.line;
  }

  get html(): string {
    this.#html ??= this.parts.map((part) => part.html).join("") + this.#footnotes;
    return this.#html;
  }

  /** The footnotes section's HTML, when the piece ends with it. */
  get footnotes(): string {
    return this.#footnotes;
  }

  /**
   * `source` from its first line with text on it. The blank lines above a piece don't change its
   * HTML but for the lines its source-line markers name, so a piece that gained or lost blank
   * lines above it renders like its old self (unmark-1793451427066-4-97884ee7.7).
   */
  get text(): string {
    return this.#skipBlankLines().text;
  }

  /** The line `text` starts on. */
  get textLine(): number {
    return this.#skipBlankLines().line;
  }

  #skipBlankLines(): { text: string; line: number } {
    if (!this.#textStart) {
      let offset = 0;
      let line = this.line;
      BLANK_LINE.lastIndex = 0;
      while (BLANK_LINE.test(this.source)) {
        offset = BLANK_LINE.lastIndex;
        line++;
      }
      this.#textStart = { text: this.source.slice(offset), line };
    }
    return this.#textStart;
  }

  /** Whether this piece's HTML is `other`'s, with the source-line markers moved to its lines. */
  rendersLike(other: Block): boolean {
    if (this.text !== other.text || this.parts.length !== other.parts.length) return false;
    // Parts with the same origin have the same lines, blank ones included.
    const reused = this.parts.every(
      (part, index) => part.context !== undefined && part.origin === other.parts[index]?.origin,
    );
    if (reused && !this.#footnotes && !other.#footnotes) return true;
    const moved = this.movable && other.movable;
    return (
      this.html === (moved ? moveMarkers(other.html, this.textLine - other.textLine) : other.html)
    );
  }

  /** This piece's rendering for the same lines, `delta` lines further down. */
  movedBy(delta: number): Block {
    if (delta === 0) return this;
    const parts = this.parts.map((part) => part.movedTo(part.line + delta));
    return new Block(this.source, this.line + delta, parts, this.#footnotes);
  }
}

/**
 * Where a rendering still being rendered carries on from: the block tokens of the pieces after
 * the ones rendered so far.
 */
interface Unrendered {
  /**
   * Block tokens from the parse of this document or of one it's an edit of, untouched by any
   * render from `from` on: a splice renders copies of them (spliceBlocks).
   */
  readonly tokens: readonly Token[];
  /** The index in `tokens` of the first block not rendered yet. */
  from: number;
  /** How many lines further down the blocks from `from` on are now than their tokens map them. */
  readonly delta: number;
  /** The labels of the document's footnote definitions, the unrendered ones among them. */
  readonly footnoteLabels: readonly string[];
}

/**
 * A document's pieces as they're rendered, and what splicing the next edit into them takes
 * (spliceBlocks).
 */
export class Rendering {
  /** The source with markdown-it's line breaks, "\n" alone. */
  src = "";
  /** The offset each line of `src` starts at. */
  lineStarts: number[] = [];
  /** The document's link reference definitions. */
  references: Definitions = {};
  /**
   * The lines of each footnote definition among the pieces rendered so far, which render in the
   * footnotes section, not a piece.
   */
  footnotes: [number, number][] = [];
  /** The pieces rendered so far, in order. */
  readonly blocks: Block[] = [];
  /** Whether `blocks` holds the whole document. */
  complete = false;
  /**
   * Where rendering carries on from, while it's between two pieces of the document and no
   * splice has taken the rest over.
   */
  unrendered: Unrendered | undefined;

  /** The pieces but the footnotes section. */
  get blocksAboveFootnotes(): readonly Block[] {
    return this.blocks.at(-1)?.parts.length === 0 ? this.blocks.slice(0, -1) : this.blocks;
  }

  /**
   * Whether an edit can be spliced in: every piece is rendered, or rendering is between two of
   * them; the pieces rendered are reusable, their lines run on from one to the next but for
   * footnote definitions, and no footnote definition among them references a footnote, which
   * would number it where the definition is rather than where it renders.
   */
  get spliceable(): boolean {
    if (!this.complete && !this.unrendered) return false;
    let line = 0;
    let definition = 0;
    for (const block of this.blocksAboveFootnotes) {
      for (let span = this.footnotes[definition]; span?.[0] === line; ) {
        line = span[1];
        span = this.footnotes[++definition];
      }
      if (!block.reusable || block.line !== line) return false;
      line = block.end;
    }
    return this.footnotes.every(([start, end]) => {
      const source = this.src.slice(this.lineStarts[start], this.lineStarts[end]);
      return source.match(FOOTNOTE_SYNTAX)?.length === 1;
    });
  }
}

/** An edit spliced into a rendering (spliceBlocks). */
export interface Splice {
  readonly rendering: Rendering;
  /** Renders the pieces after the spliced ones into `rendering`, unless it's complete. */
  readonly rest: Generator<Block> | undefined;
}

/** The reusable renderings among `blocks`, for the next render's `htmlBlocks`. */
export function blockCache(blocks: Iterable<Block>): BlockCache {
  const cache = new Map<string, BlockPart>();
  for (const block of blocks) {
    for (const part of block.parts) if (part.context) cache.set(part.source, part);
  }
  return cache;
}

/** Moves `html`'s source-line markers `delta` lines down. */
function moveMarkers(html: string, delta: number): string {
  if (delta === 0) return html;
  return html.replace(MARKER, (_, line: string) => ` ${SOURCE_LINE}="${Number(line) + delta}"`);
}

/**
 * Yields `src` one piece at a time: the smallest pieces that can be sanitized on their own.
 * `env` collects what `md.parse()` would, such as the outline, as the pieces are yielded, and
 * `rendering` the pieces. Blocks whose lines `cache` has, rendered in a document with the same
 * link references and heading ids before them, reuse that rendering instead of rendering again.
 *
 * Blocks inside a raw HTML element the document leaves open across blocks, such as
 * `<details>` wrapped around markdown, come as one piece with the element: sanitized
 * apart, the HTML parser would close the element early and move the blocks out of it.
 */
export function* htmlBlocks(
  md: MarkdownIt,
  src: string,
  env: Env,
  cache: BlockCache = new Map(),
  rendering = new Rendering(),
): Generator<Block> {
  const rules = coreRules(md);
  const state = new md.core.State(src, md, env);
  for (const rule of [...rules.beforeBlock, rules.block, ...rules.afterBlock]) rule(state);
  const pieces = new Pieces(md, rules, state, cache);
  rendering.src = state.src;
  rendering.lineStarts = pieces.lineStarts;
  rendering.references = pieces.references.defined;
  rendering.footnotes = pieces.footnotes;
  rendering.unrendered = {
    tokens: state.tokens,
    from: 0,
    delta: 0,
    footnoteLabels: footnoteLabels(env),
  };
  yield* renderPieces(pieces, rendering, 0, state.tokens);
}

/**
 * Renders the pieces of `rendering.unrendered`'s tokens into `rendering`, the first on `line`,
 * and then the footnotes section from the definitions among `section`. With `copy`, the pieces
 * render from what it makes of each block's tokens.
 */
function* renderPieces(
  pieces: Pieces,
  rendering: Rendering,
  line: number,
  section: Token[],
  copy?: (block: Token[]) => Token[],
): Generator<Block> {
  const unrendered = rendering.unrendered as Unrendered;
  for (const block of pieces.of(unrendered.tokens, line, unrendered.from, copy)) {
    rendering.blocks.push(block);
    unrendered.from = pieces.next;
    yield block;
    // A splice took the rest over (spliceBlocks): rendering it here too would inline-parse the
    // tokens the splice copies.
    if (rendering.unrendered !== unrendered) return;
  }
  // What's left ends the document: the footnotes section, after any blocks still waiting for a
  // raw HTML element the document never closes.
  rendering.unrendered = undefined;
  const last = pieces.finish(section);
  if (last) {
    rendering.blocks.push(last);
    yield last;
  }
  rendering.complete = true;
}

/**
 * Renders `src` as an edit of `previous`, block-parsing only the blocks the edit may have
 * changed: a 1 MB document's block parse alone takes about 70 ms of q47's 250 ms
 * (unmark-1793451427066-4-97884ee7.1). Every piece before the first changed line whose parse
 * stopped before it is the same; the parse resumes at the next one and stops at the first
 * block that ends where an old piece ended after the edit, since every piece after that has
 * the same lines and so the same parse.
 *
 * While `previous` is still being rendered, the edit and the block the parse resumes at must be
 * among the pieces it has rendered, and `rest` renders the pieces after them from copies of
 * `previous`'s block tokens, which skips the block parse of all of them
 * (unmark-1793451427066-4-97884ee7.8). `previous` hands the rest over: it renders no further.
 *
 * Returns `undefined` when the edit reaches what the pieces it keeps depend on: a link
 * reference or footnote definition, or the heading ids and footnote numbers after it. Then the
 * whole document needs rendering.
 */
export function spliceBlocks(
  md: MarkdownIt,
  src: string,
  env: Env,
  previous: Rendering,
): Splice | undefined {
  if (!previous.spliceable) return undefined;
  const unrendered = previous.unrendered;
  const rules = coreRules(md);
  // Rendered apart from `env` until the splice is sure to succeed.
  const spliceEnv: Partial<RenderEnv> & Env = {
    headings: [],
    references: { ...previous.references },
  };
  // A whole parse defines every footnote label before it numbers any reference, and the
  // definitions after the pieces rendered don't parse again. A splice never adds or removes one.
  if (unrendered) defineFootnotes(spliceEnv, unrendered.footnoteLabels);
  const state = new md.core.State(src, md, spliceEnv);
  for (const rule of rules.beforeBlock) rule(state);
  const old = previous.src;
  const edited = state.src;

  const shorter = Math.min(old.length, edited.length);
  // Compared a run of characters at a time, halving the run at the first difference: a 1 MB
  // document's characters one at a time took 5-20 ms.
  let prefix = 0;
  let suffix = 0;
  for (let run = 1 << 16; run > 0; run >>= 1) {
    while (prefix + run <= shorter && old.startsWith(edited.slice(prefix, prefix + run), prefix)) {
      prefix += run;
    }
  }
  for (let run = 1 << 16; run > 0; run >>= 1) {
    while (
      prefix + suffix + run <= shorter &&
      old.endsWith(
        edited.slice(edited.length - suffix - run, edited.length - suffix),
        old.length - suffix,
      )
    ) {
      suffix += run;
    }
  }
  const blocks = previous.blocksAboveFootnotes;
  const firstChange = lineAt(previous.lineStarts, prefix);
  // A piece's parse read its own lines, then the next line with text, which ended it: an
  // indented code block or a list reads on past blank lines. That line can end it by starting a
  // table, which takes the delimiter row after it too. A piece that read only lines before the
  // changed one is the same.
  let first = firstBlockEndingAtOrAfter(blocks, firstChange);
  while (first > 0) {
    const ended = textLineFrom(old, previous.lineStarts, (blocks[first - 1] as Block).end);
    if (ended + 1 < firstChange) break;
    first--;
  }
  // Nothing after the rendered pieces has a rendering to splice into.
  if (unrendered && first === blocks.length) return undefined;
  const start = blocks[first]?.line ?? blocks.at(-1)?.end ?? 0;
  // The edit is in a footnote definition between two pieces.
  if (start > firstChange) return undefined;

  const pieces = new Pieces(md, rules, state, new Map());
  const delta = pieces.lineStarts.length - previous.lineStarts.length;
  // An old line with the line break before it in the unchanged end of the document starts the
  // same text in the edited one, `delta` lines further on.
  const unchangedFrom = old.length - suffix;
  const resumes = (oldLine: number) =>
    (previous.lineStarts[oldLine] ?? Number.POSITIVE_INFINITY) - 1 >= unchangedFrom;

  // Past the pieces rendered so far, the parse can't resume at one of them.
  const renderedEnd = unrendered ? (blocks.at(-1) as Block).end : Number.POSITIVE_INFINITY;
  const tokens: Token[] = [];
  const blockState = new md.block.State(edited, md, spliceEnv, tokens);
  let next = blocks.length;
  let resumed: number | undefined;
  for (let line = start; line < blockState.lineMax; ) {
    line = parseBlock(md, blockState, line);
    const oldEnd = line - delta;
    const ended = firstBlockEndingAtOrAfter(blocks, oldEnd);
    if (blocks[ended]?.end === oldEnd && ended >= first && resumes(oldEnd)) {
      next = ended + 1;
      resumed = oldEnd;
      break;
    }
    if (oldEnd >= renderedEnd) return undefined;
  }
  if (resumed === undefined) {
    if (unrendered) return undefined;
    resumed = previous.lineStarts.length;
  }
  // The old lines the edit replaced, with any after the last piece: a definition there may
  // have been one that kept pieces look up.
  const replaced = old.slice(previous.lineStarts[start], previous.lineStarts[resumed]);
  if (
    DEFINITION.test(replaced) ||
    tokens.some(({ type }) => type === "reference_definition" || type === "footnote_reference_open")
  ) {
    return undefined;
  }

  // Footnote definitions parse again where they are now, after the edit's blocks and before any
  // inline parse, as a whole parse defines every label before it numbers any reference.
  const footnotes: [number, number][] = [];
  for (const [definitionStart, definitionEnd] of previous.footnotes) {
    if (definitionEnd >= firstChange && definitionStart < resumed) return undefined;
    const moved = definitionStart >= resumed ? delta : 0;
    const span: [number, number] = [definitionStart + moved, definitionEnd + moved];
    const parsed = tokens.length;
    parseBlock(md, blockState, span[0]);
    if (tokens[parsed]?.type !== "footnote_reference_open") return undefined;
    footnotes.push(span);
  }
  state.tokens = tokens;
  for (const rule of rules.afterBlock) rule(state);
  const definitions = state.tokens.findIndex(({ type }) => type === "footnote_reference_open");
  const blockTokens = definitions < 0 ? state.tokens : state.tokens.slice(0, definitions);

  const rendering = new Rendering();
  rendering.src = edited;
  rendering.lineStarts = pieces.lineStarts;
  rendering.references = pieces.references.defined;
  // The pieces still to render add theirs.
  pieces.footnotes.push(...footnotes);
  rendering.footnotes = pieces.footnotes;
  for (let index = 0; index < first; index++) {
    const block = blocks[index] as Block;
    if (!pieces.reuse(block)) return undefined;
    rendering.blocks.push(block);
  }
  for (const block of pieces.of(blockTokens, start)) {
    if (!block.reusable) return undefined;
    rendering.blocks.push(block);
  }
  if (pieces.unfinished) return undefined;
  for (let index = next; index < blocks.length; index++) {
    const moved = (blocks[index] as Block).movedBy(delta);
    if (!pieces.reuse(moved)) return undefined;
    rendering.blocks.push(moved);
  }
  const definitionTokens = definitions < 0 ? [] : state.tokens.slice(definitions);
  pieces.parseFootnoteDefinitions(definitionTokens);
  if (!unrendered) {
    const footnotesSection = pieces.finish(definitionTokens);
    if (footnotesSection) rendering.blocks.push(footnotesSection);
    rendering.complete = true;
  }
  const headings = (env as Partial<RenderEnv>).headings;
  headings?.push(...(spliceEnv.headings ?? []));
  if (!unrendered) return { rendering, rest: undefined };

  // The splice has succeeded, so the rest of the outline goes straight to `env`'s.
  spliceEnv.headings = headings;
  rendering.unrendered = { ...unrendered, delta: unrendered.delta + delta };
  previous.unrendered = undefined;
  const tokenDelta = rendering.unrendered.delta;
  // The footnotes section takes the definitions among the copies too.
  const copy = (block: Token[]) => {
    const copies = block.map((token) => movedToken(token, tokenDelta));
    definitionTokens.push(...copies);
    return copies;
  };
  const line = (rendering.blocks.at(-1) as Block).end;
  return { rendering, rest: renderPieces(pieces, rendering, line, definitionTokens, copy) };
}

// A link reference or footnote definition's label, possibly inside a block quote or list, or
// text that only looks like one: a splice gives up on either.
const DEFINITION = /\]:/;

/** The core rules around the block and inline parses, which htmlBlocks runs apart. */
interface CoreRules {
  beforeBlock: ((state: StateCore) => void)[];
  block: (state: StateCore) => void;
  afterBlock: ((state: StateCore) => void)[];
  inline: (state: StateCore) => void;
  footnoteTail: (state: StateCore) => void;
  afterInline: ((state: StateCore) => void)[];
}

function coreRules(md: MarkdownIt): CoreRules {
  const rules = md.core.ruler.__rules__.filter((rule) => rule.enabled);
  const block = rules.findIndex((rule) => rule.name === "block");
  const inline = rules.findIndex((rule) => rule.name === "inline");
  const blockRule = rules[block];
  const inlineRule = rules[inline];
  const footnoteTail = rules[inline + 1];
  if (!blockRule || !inlineRule || footnoteTail?.name !== "footnote_tail") {
    throw new Error("Expected markdown-it's core rules to run footnote_tail right after inline");
  }
  return {
    beforeBlock: rules.slice(0, block).map(({ name, fn }) =>
      // markdown-it's normalize rule replaces "\r" and NUL, which documents rarely have; looking
      // for them first saves scanning a 1 MB source twice on every keystroke.
      name === "normalize"
        ? (state: StateCore) => {
            if (state.src.includes("\r") || state.src.includes("\0")) fn(state);
          }
        : fn,
    ),
    block: blockRule.fn,
    afterBlock: rules.slice(block + 1, inline).map((rule) => rule.fn),
    inline: inlineRule.fn,
    footnoteTail: footnoteTail.fn,
    afterInline: rules.slice(inline + 2).map((rule) => rule.fn),
  };
}

/**
 * Parses the top-level block at or after `line` into `state`'s tokens and returns the line it
 * ended on, as one turn of markdown-it's `ParserBlock.tokenize` loop at the top level, which
 * can't stop between blocks.
 */
function parseBlock(md: MarkdownIt, state: StateBlock, line: number): number {
  state.line = state.skipEmptyLines(line);
  if (state.line >= state.lineMax) return state.line;
  const start = state.line;
  for (const rule of md.block.ruler.getRules("")) {
    if (rule(state, start, state.lineMax, false)) {
      if (state.line <= start) throw new Error("block rule didn't increment state.line");
      return state.line;
    }
  }
  throw new Error("none of the block rules matched");
}

/**
 * The first line at or after `line` with text on it, or the line count. Whitespace markdown-it
 * counts as text (a no-break space) counts as blank here, which only reads on further.
 */
function textLineFrom(src: string, lineStarts: readonly number[], line: number): number {
  for (; line < lineStarts.length; line++) {
    if (src.slice(lineStarts[line], lineStarts[line + 1]).trim() !== "") return line;
  }
  return lineStarts.length;
}

/** The line `offset` is on. */
function lineAt(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((lineStarts[middle] as number) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** The first of `blocks`, whose ends ascend, that ends at or after `line`. */
function firstBlockEndingAtOrAfter(blocks: readonly Block[], line: number): number {
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((blocks[middle] as Block).end < line) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Renders a document's top-level blocks into pieces, reusing earlier renderings, and collects
 * what they add to the render: the outline, heading ids, footnote numbers, and link reference
 * lookups.
 */
class Pieces {
  readonly lineStarts: number[];
  readonly references: LookupRecorder;
  /** The lines of each footnote definition among the blocks so far. */
  readonly footnotes: [number, number][] = [];
  /** The index of the token after the last piece `of` yielded. */
  next = 0;
  readonly #md: MarkdownIt;
  readonly #rules: CoreRules;
  readonly #state: StateCore;
  readonly #cache: BlockCache;
  readonly #ids: HeadingIds;
  readonly #openElements: string[] = [];
  #parts: BlockPart[] = [];
  #pieceStart = 0;
  // Where the last block ended. A block's lines run from there, so they include every line it
  // could have read: a token's map can start after the block's first line, as an alert's does
  // after its `> [!NOTE]` line.
  #line = 0;

  constructor(md: MarkdownIt, rules: CoreRules, state: StateCore, cache: BlockCache) {
    this.#md = md;
    this.#rules = rules;
    this.#state = state;
    this.#cache = cache;
    // The block rules run on the normalized source, whose lines end in "\n" alone.
    this.lineStarts = linesOf(state.src);
    this.references = recordLookups(state.env);
    this.#ids = headingIdsFor(state.env);
  }

  /** Whether the last pieces wait for a raw HTML element to close. */
  get unfinished(): boolean {
    return this.#parts.length > 0;
  }

  // Absent when a caller (e.g. the GFM spec tests) doesn't collect an outline. Read from the
  // env each time: a splice hands the rest of the outline to the render's own env once it has
  // succeeded (spliceBlocks).
  get #headings(): Heading[] | undefined {
    return (this.#state.env as Partial<RenderEnv>).headings;
  }

  /**
   * Yields the pieces of `tokens` from index `from` on, whose first block's lines start at
   * `line`. With `copy`, each block renders from what it makes of the block's tokens.
   */
  *of(
    tokens: readonly Token[],
    line: number,
    from = 0,
    copy?: (block: Token[]) => Token[],
  ): Generator<Block> {
    this.#line = line;
    let depth = 0;
    let start = from;
    for (let index = from; index < tokens.length; index++) {
      depth += (tokens[index] as Token).nesting;
      if (depth !== 0) continue;
      const block = tokens.slice(start, index + 1);
      const blockTokens = copy ? copy(block) : block;
      start = index + 1;
      let end = this.#line;
      for (const token of blockTokens) if (token.map && token.map[1] > end) end = token.map[1];
      // A footnote definition renders in the footnotes section, which footnote_tail builds.
      if (blockTokens[0]?.type === "footnote_reference_open") {
        this.parseFootnoteDefinitions(blockTokens);
        this.footnotes.push([this.#line, end]);
        this.#line = end;
        continue;
      }
      if (this.#parts.length === 0) this.#pieceStart = this.#line;
      const part = this.#render(blockTokens, [this.#line, end]);
      this.#line = end;
      for (const html of part.rawHtml) trackTags(html, this.#openElements);
      this.#parts.push(part);
      if (this.#openElements.length > 0) continue;
      this.next = start;
      yield this.#parts.length === 1
        ? new Block(part.source, part.line, this.#parts)
        : new Block(this.#sourceOf([this.#pieceStart, this.#line]), this.#pieceStart, this.#parts);
      this.#parts = [];
    }
  }

  /** Inline-parses footnote definitions, which footnote_tail moves into the footnotes section. */
  parseFootnoteDefinitions(tokens: Token[]): void {
    this.references.record(false);
    this.#run(tokens, [this.#rules.inline]);
  }

  /**
   * The last piece: any blocks still waiting for a raw HTML element to close, and the footnotes
   * section. `tokens` hold the inline-parsed footnote definitions, among other blocks or alone.
   */
  finish(tokens: Token[]): Block | undefined {
    // Nothing after the last block is reused, so nothing records what it depends on.
    this.references.record(false);
    this.#ids.record();
    const section = this.#run(tokens, [this.#rules.footnoteTail]);
    let footnotes = "";
    if (section.at(-1)?.type === "footnote_block_close") {
      const open = section.findLastIndex((token) => token.type === "footnote_block_open");
      const rendered = this.#run(section.slice(open), this.#rules.afterInline);
      footnotes = this.#md.renderer.render(rendered, this.#md.options, this.#state.env);
    }
    if (this.#parts.length > 0) {
      const source = this.#sourceOf([this.#pieceStart, this.#line]);
      return new Block(source, this.#pieceStart, this.#parts, footnotes);
    }
    return footnotes ? new Block("", this.lineStarts.length, [], footnotes) : undefined;
  }

  /**
   * Adds what `block`'s earlier rendering added to the render, if its headings get the same ids
   * and its footnote references the same numbers; returns whether they did.
   */
  reuse(block: Block): boolean {
    for (const { context } of block.parts) {
      if (!context || !this.#retake(context)) return false;
    }
    return true;
  }

  #sourceOf([start, end]: [number, number]): string {
    const src = this.#state.src;
    return src.slice(this.lineStarts[start], this.lineStarts[end] ?? src.length);
  }

  // A block takes heading ids or footnote numbers, never both (see #render), so a failed retake
  // has taken nothing.
  #retake({ ids, outline, footnotes }: BlockContext): boolean {
    // Most blocks have neither, and a splice retakes every block of the document.
    if (ids.length === 0 && footnotes.labels.length === 0 && footnotes.refs.length === 0) {
      return true;
    }
    const env = this.#state.env;
    if (!retakeFootnotes(env, footnotes) || !this.#ids.retake(ids)) return false;
    this.#headings?.push(...outline);
    return true;
  }

  #render(tokens: Token[], span: [number, number]): BlockPart {
    const [start, end] = span;
    const source = this.#sourceOf(span);
    const reusable =
      end > start && !source.includes(INLINE_FOOTNOTE) && !source.includes(SOURCE_LINE);
    const cached = reusable ? this.#cache.get(source) : undefined;
    const context = cached?.context;
    if (
      cached &&
      context &&
      this.references.resolveAlike(context.lookups) &&
      this.#retake(context)
    ) {
      return cached.movedTo(start);
    }

    const lookups = this.references.record(reusable);
    const ids = this.#ids.record();
    const headingCount = this.#headings?.length ?? 0;
    const block = this.#run(this.#run(tokens, [this.#rules.inline]), this.#rules.afterInline);
    const html = this.#md.renderer.render(block, this.#md.options, this.#state.env);
    const outline = this.#headings?.slice(headingCount) ?? [];
    const footnotes = footnoteUse(this.#state.env, source, block);
    // Retaking both in one block would need undoing one when the other fails.
    const takesBoth = ids.length > 0 && footnotes.refs.length > 0;
    const blockContext = lookups && !takesBoth ? { lookups, ids, outline, footnotes } : undefined;
    const frontMatter = block[0]?.type === "front_matter";
    return new BlockPart(source, span, blockContext, rawHtmlOf(block), html, frontMatter);
  }

  // Rules read and replace `tokens` on the state; a block's view shares everything else.
  #run(tokens: Token[], rules: ((state: StateCore) => void)[]): Token[] {
    const view: StateCore = Object.create(this.#state, {
      tokens: { value: tokens, writable: true },
    });
    for (const rule of rules) rule(view);
    return view.tokens;
  }
}

/** Records the link references each block looks up. */
interface LookupRecorder {
  /** The document's definitions. */
  readonly defined: Definitions;
  /** Starts recording the next block's lookups; `undefined` when `enabled` is false. */
  record(enabled: boolean): [string, Reference][] | undefined;
  /** Whether each label resolves to what it did in the render that recorded it. */
  resolveAlike(recorded: readonly (readonly [string, Reference])[]): boolean;
}

/**
 * Makes `env`'s link references record the lookups of the block being rendered. Always
 * defined, unlike after `md.parse()`: with none, the link rules don't look anything up, and a
 * block reused after the document gained a definition would miss its link.
 */
function recordLookups(env: Env): LookupRecorder {
  const defined: Definitions = env.references ?? {};
  let lookups: [string, Reference][] | undefined;
  env.references = new Proxy(defined, {
    get(target, label) {
      const reference = Reflect.get(target, label);
      if (typeof label === "string") lookups?.push([label, reference]);
      return reference;
    },
  });
  return {
    defined,
    record(enabled) {
      lookups = enabled ? [] : undefined;
      return lookups;
    },
    resolveAlike(recorded) {
      return recorded.every(([label, was]) => {
        const now = Object.hasOwn(defined, label) ? defined[label] : undefined;
        return now?.href === was?.href && now?.title === was?.title;
      });
    },
  };
}

/**
 * A copy of `token`, from another rendering's block parse, for its lines `delta` lines further
 * down. Rendering the copy leaves `token` as it is: the inline parse and the rules after it add
 * to a token's children and attributes in place.
 */
function movedToken(token: Token, delta: number): Token {
  const copy: Token = Object.assign(Object.create(Object.getPrototypeOf(token) as object), token);
  copy.map = token.map && [token.map[0] + delta, token.map[1] + delta];
  // The source_lines rule marked the token as its block parse ended.
  copy.attrs =
    token.attrs?.map(([name, value]) => [
      name,
      name === SOURCE_LINE ? String(Number(value) + delta) : value,
    ]) ?? null;
  copy.children = token.children && [...token.children];
  return copy;
}

/** The offset each line of `src` starts at. */
function linesOf(src: string): number[] {
  const starts = [0];
  for (let end = src.indexOf("\n"); end !== -1; end = src.indexOf("\n", end + 1)) {
    starts.push(end + 1);
  }
  return starts;
}

// Void elements never contain anything, whether or not their tag ends in "/>".
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// A comment, or a start or end tag with its attributes (quoted values may contain ">").
const TAG =
  /<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;

/** A block's raw HTML: the HTML blocks and inline tags whose elements may stay open after it. */
function rawHtmlOf(tokens: Token[]): string[] {
  const html: string[] = [];
  for (const token of tokens) {
    if (token.type === "html_block") html.push(token.content);
    for (const child of token.children ?? []) {
      if (child.type === "html_inline") html.push(child.content);
    }
  }
  return html;
}

/**
 * Updates the stack of raw HTML elements still open. An end tag closes back to its start
 * tag, as the HTML parser does; elements the parser closes implicitly, such as an
 * unclosed `<p>`, stay on the stack, which only means fewer places to split.
 */
function trackTags(html: string, openElements: string[]): void {
  for (const [, slash, rawName] of html.matchAll(TAG)) {
    if (rawName === undefined) continue;
    const name = rawName.toLowerCase();
    if (slash) {
      const open = openElements.lastIndexOf(name);
      if (open >= 0) openElements.length = open;
    } else if (!VOID_ELEMENTS.has(name)) {
      openElements.push(name);
    }
  }
}
