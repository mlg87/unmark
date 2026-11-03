// Find in Preview (unmark-1793451439168-30-08e35535). WKWebView.find selects and scrolls to each
// match but reports only whether it found one, so the find bar's total comes from here. The count
// follows what WebKit's find matches: text runs on across inline elements but not across blocks,
// and whitespace outside `pre` collapses to one space, as it renders.

/** Elements whose text runs on into the text around them; every other element starts a new run. */
const INLINE_ELEMENTS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "tspan",
  "u",
  "var",
  "wbr",
]);

/**
 * Elements whose text never renders, so find never matches it: Mermaid's SVG carries its CSS in a
 * `<style>`, and KaTeX's MathML keeps the TeX source in an `<annotation>`.
 */
const UNRENDERED_ELEMENTS = new Set([
  "annotation",
  "annotation-xml",
  "noscript",
  "script",
  "style",
  "template",
]);

/** A DOM position, as a Range boundary gives it. */
export interface Point {
  node: Node;
  offset: number;
}

/** A query's matches in some rendered text, and where a point sits among them. */
export interface MatchCount {
  count: number;
  /** How many matches start before the point; null without a point or when it isn't in the text. */
  before: number | null;
  /** Whether a match starts at the point. */
  startsAtPoint: boolean;
}

/**
 * How many times `query` occurs in `root`'s rendered text, ignoring case, and where `point` sits
 * among the matches. Matches don't overlap.
 */
export function countMatches(root: Element, query: string, point?: Point): MatchCount {
  const result: MatchCount = { count: 0, before: null, startsAtPoint: false };
  if (query === "") return result;
  const pattern = new RegExp(query.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"), "giu");
  for (const run of textRuns(root, point)) {
    const starts = Array.from(run.text.matchAll(pattern), (match) => match.index);
    if (run.point !== undefined) {
      const at = run.point;
      result.before = result.count + starts.filter((start) => start < at).length;
      result.startsAtPoint = starts.includes(at);
    }
    result.count += starts.length;
  }
  return result;
}

/** A stretch of rendered text that no block boundary interrupts. */
interface TextRun {
  text: string;
  /** Where the point falls in `text`, when it falls in this run. */
  point?: number;
}

/** `root`'s text, one run per stretch of text that no block boundary interrupts. */
function textRuns(root: Element, point?: Point): TextRun[] {
  const runs: TextRun[] = [];
  let run = "";
  /** Where `point` falls in `run`, before its whitespace collapses. */
  let pointInRun: number | undefined;
  const endRun = (preformatted: boolean) => {
    const text = preformatted ? run : run.replace(/\s+/g, " ").trim();
    if (pointInRun !== undefined) {
      // Kept even when empty, so the point is found.
      const before = run.slice(0, pointInRun);
      runs.push({
        text,
        point: preformatted ? before.length : before.replace(/\s+/g, " ").trimStart().length,
      });
    } else if (text !== "") {
      runs.push({ text });
    }
    run = "";
    pointInRun = undefined;
  };
  const visit = (parent: Node, preformatted: boolean) => {
    let index = 0;
    for (let node = parent.firstChild; node; node = node.nextSibling, index++) {
      if (parent === point?.node && index === point.offset) pointInRun = run.length;
      if (node.nodeType === Node.TEXT_NODE) {
        if (node === point?.node) pointInRun = run.length + point.offset;
        run += (node as Text).data;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (UNRENDERED_ELEMENTS.has(element.localName)) continue;
        if (INLINE_ELEMENTS.has(element.localName)) {
          visit(element, preformatted);
          continue;
        }
        const inner = preformatted || element.localName === "pre";
        endRun(preformatted);
        visit(element, inner);
        endRun(inner);
      }
    }
    if (parent === point?.node && index === point.offset) pointInRun = run.length;
  };
  visit(root, false);
  endRun(false);
  return runs;
}
