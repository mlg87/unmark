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

/** How many times `query` occurs in `root`'s rendered text, ignoring case. Matches don't overlap. */
export function countMatches(root: Element, query: string): number {
  if (query === "") return 0;
  const pattern = new RegExp(query.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"), "giu");
  let count = 0;
  for (const run of textRuns(root)) count += run.match(pattern)?.length ?? 0;
  return count;
}

/** `root`'s text, one string per stretch of text that no block boundary interrupts. */
function textRuns(root: Element): string[] {
  const runs: string[] = [];
  let run = "";
  const endRun = (preformatted: boolean) => {
    const text = preformatted ? run : run.replace(/\s+/g, " ").trim();
    if (text !== "") runs.push(text);
    run = "";
  };
  const visit = (parent: Node, preformatted: boolean) => {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === Node.TEXT_NODE) {
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
  };
  visit(root, false);
  endRun(false);
  return runs;
}
