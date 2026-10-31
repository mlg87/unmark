// highlight.js's own prebuilt bundle, not highlight.js/lib/common: both register the
// same 36 languages, but esbuild minifies lib/common to 160 KB, over #17's 150 KB
// entry budget (build.mjs), while the prebuilt bundle adds about 126 KB.
import hljs from "@highlightjs/cdn-assets/es/highlight.min.js";
import { alert } from "@mdit/plugin-alert";
import { fullEmoji } from "@mdit/plugin-emoji";
import { tasklist } from "@mdit/plugin-tasklist";
import { tex } from "@mdit/plugin-tex";
import { LinkifyIt } from "linkify-it";
import markdownit, { type MarkdownIt } from "markdown-it";
import { footnotes } from "./footnotes.ts";
import { frontMatter } from "./front-matter.ts";
import { headingAnchors } from "./headings.ts";
import { extendAllowlist } from "./sanitize.ts";

export function createMarkdown(): MarkdownIt {
  const md = markdownit("default", {
    // GitHub renders raw HTML; sanitize.ts strips what GitHub's allowlist does (#15).
    html: true,
    linkify: true,
    highlight: highlightFencedCode,
  });

  // The default preset already enables both rules; enabling them by name fails
  // loudly if a markdown-it upgrade ever moves them out of the preset.
  md.enable(["table", "strikethrough"]);

  restrictFuzzyLinksToWww(md);
  alignTableCellsWithAttribute(md);
  filterDisallowedRawHtml(md);

  // github.com emits <del> for ~~text~~; markdown-it defaults to <s>.
  md.renderer.rules.s_open = () => "<del>";
  md.renderer.rules.s_close = () => "</del>";

  // Class names match github.com's task-list markup, which github-markdown-css styles.
  // No <label> wrapper: github.com doesn't emit one for read-only task lists.
  md.use(tasklist, {
    label: false,
    containerClass: "contains-task-list",
    itemClass: "task-list-item",
    checkboxClass: "task-list-item-checkbox",
  });
  // github.com adds task-list markup after sanitizing; here it passes through the
  // sanitizer, so it needs these exact additions.
  extendAllowlist({
    elements: { input: ["type", "checked", "disabled"] },
    classes: {
      ul: ["contains-task-list"],
      ol: ["contains-task-list"],
      li: ["task-list-item"],
      input: ["task-list-item-checkbox"],
    },
  });
  // highlight.js wraps tokens in <span class="hljs-…">. A dotted scope such as
  // title.class adds suffix classes ("hljs-title class_"), which the themes also select.
  extendAllowlist({ classes: { span: [/^hljs-[a-z_-]+$/, /^[a-z]+_+$/] } });

  frontMatter(md);
  footnotes(md);
  githubAlerts(md);
  mermaidFences(md);
  githubEmoji(md);
  githubMath(md);
  headingAnchors(md);

  return md;
}

// Mermaid diagrams (#19) render after sanitizing, in diagrams.ts, which index.ts loads
// only when a document has one: Mermaid is several MB (epic #3, q3, q38, q55). Until
// then the block is its escaped source, so a document reads fine before the diagram
// draws or if it can't.
function mermaidFences(md: MarkdownIt): void {
  const renderFence = md.renderer.rules.fence;
  if (!renderFence) throw new Error("markdown-it no longer has a default fence rule");
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token?.info.trim().split(/\s+/)[0] !== "mermaid") {
      return renderFence(tokens, idx, options, env, self);
    }
    return `<pre class="mermaid-source" data-mermaid>${md.utils.escapeHtml(token.content)}</pre>\n`;
  };
  extendAllowlist({
    elements: { pre: ["data-mermaid"] },
    classes: { pre: ["mermaid-source"] },
  });
}

// Syntax highlighting with GitHub's light and dark themes (#17, epic #3 decision q24).
// Like github.com, only a fence's declared language is highlighted: an absent or
// unknown language renders plain, never auto-detected. Returning "" tells
// markdown-it to escape the code itself.
function highlightFencedCode(code: string, language: string): string {
  if (!language || !hljs.getLanguage(language)) return "";
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

// Every :shortcode: has a colon, and every one of fullEmoji's ASCII shortcuts (`:)`, `<3`,
// `;)`, `8-)`, …) has one of these. "&" covers entities that decode to them, like `&#58;`.
const EMOJI_CANDIDATE = /[:;<&]|-\)/;

// Plain emoji characters: github.com's <g-emoji> wrapper isn't on its own allowlist.
// The plugin tests every text against one regex of all ~1,900 shortcodes, which WebKit
// runs far slower than V8: 280 ms of a 1 MB document's parse (q47). Its rule now sees
// only the inline tokens that could contain one; the rest can't change.
function githubEmoji(md: MarkdownIt): void {
  md.use(fullEmoji);
  const { fn: replaceShortcodes } = md.core.ruler.__rules__[md.core.ruler.__find__("emoji")] ?? {};
  if (!replaceShortcodes)
    throw new Error("@mdit/plugin-emoji no longer adds a core rule named emoji");
  md.core.ruler.at("emoji", (state) => {
    const tokens = state.tokens.filter(
      (token) => token.type === "inline" && EMOJI_CANDIDATE.test(token.content),
    );
    // The rule reads only `tokens` from the state, and replaces children on the tokens.
    return replaceShortcodes(Object.create(state, { tokens: { value: tokens } }));
  });
}

// The five alert types github.com supports, in its markup and classes, which
// github-markdown-css styles (https://github.com/orgs/community/discussions/16925).
// Each title's icon is the octicon github.com puts there as an inline <svg>.
const ALERT_OCTICONS: Record<string, string> = {
  note: "info",
  tip: "light-bulb",
  important: "report",
  warning: "alert",
  caution: "stop",
};

function githubAlerts(md: MarkdownIt): void {
  md.use(alert, {
    // github.com titles every alert "Note", "Tip", … however `[!NOTE]` is cased.
    // The sanitizer drops <svg>, so the octicon is an empty <span> that alerts.css
    // draws with a CSS mask, like github-markdown-css's heading link icon.
    titleRenderer: (tokens, idx) => {
      const name = tokens[idx]?.markup ?? "";
      const icon = `<span class="octicon octicon-${ALERT_OCTICONS[name]}" aria-hidden="true"></span>`;
      return `<p class="markdown-alert-title">${icon}${name.charAt(0).toUpperCase()}${name.slice(1)}</p>\n`;
    },
  });
  extendAllowlist({
    classes: {
      div: [
        "markdown-alert",
        ...Object.keys(ALERT_OCTICONS).map((name) => `markdown-alert-${name}`),
      ],
      p: ["markdown-alert-title"],
      span: ["octicon", ...Object.values(ALERT_OCTICONS).map((icon) => `octicon-${icon}`)],
    },
  });
}

// $…$, $$…$$, and ```math blocks, which cmark-gfm can't parse and github.com renders
// (ADR-0001). Parsing emits only a placeholder holding the escaped TeX: KaTeX is a lazy
// chunk that index.ts loads after sanitizing, only for documents that contain math.
function githubMath(md: MarkdownIt): void {
  md.use(tex, {
    delimiters: "dollars",
    mathFence: true,
    // The plugin passes displayMode only for blocks, so a display placeholder can be a <div>.
    render: (content, displayMode) => {
      const tag = displayMode ? "div" : "span";
      const source = md.utils.escapeHtml(content);
      return `<${tag} class="math" data-display="${displayMode}">${source}</${tag}>${displayMode ? "\n" : ""}`;
    },
  });
  extendAllowlist({
    elements: { span: ["data-display"], div: ["data-display"] },
    classes: { span: ["math"], div: ["math"] },
  });
}

// GFM's extended autolinks recognize scheme-less links only when they start with
// `www.` (https://github.github.com/gfm/#extended-www-autolink). linkify-it 6 has no
// www-only mode: fuzzy links are off by default, and turning them on also links bare
// `example.com`, which github.com leaves as text.
//
// Scanning every text was a 1 MB document's largest parse cost (q47), mostly linkify-it's
// fuzzy search, and its Unicode-heavy regexes run far slower in WebKit than in V8. So only
// text containing `www.`, the only fuzzy links kept, goes through a fuzzy instance, and
// only text that could hold a link reaches linkify-it at all: every default schema
// (http:, https:, ftp:, mailto:, //) has a ":" or "//", every email an "@", and "&"
// covers entities that decode to one of them.
const WWW = /www\./i;
const WWW_START = /^www\./i;
const LINK_CANDIDATE = /[:@&]|\/\//;

function restrictFuzzyLinksToWww(md: MarkdownIt): void {
  const strict = md.linkify;
  const fuzzy = new LinkifyIt({ fuzzyLink: true });
  const strictTest = strict.test.bind(strict);
  const strictMatch = strict.match.bind(strict);
  strict.test = (text) =>
    WWW.test(text) ? fuzzy.test(text) : LINK_CANDIDATE.test(text) && strictTest(text);
  strict.match = (text) =>
    WWW.test(text)
      ? (fuzzy.match(text)?.filter((link) => link.schema !== "" || WWW_START.test(link.raw)) ??
        null)
      : strictMatch(text);
}

// markdown-it aligns cells with style="text-align:…", but GitHub's sanitizer
// allowlist (#15) strips style attributes. github.com emits align="…", which survives.
function alignTableCellsWithAttribute(md: MarkdownIt): void {
  md.core.ruler.after("block", "gfm_table_align", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "th_open" && token.type !== "td_open") continue;
      const align = /^text-align:(\w+)$/.exec(String(token.attrGet("style") ?? ""))?.[1];
      if (!align) continue;
      token.attrs = token.attrs?.filter(([name]) => name !== "style") ?? null;
      token.attrSet("align", align);
    }
  });
}

// GFM's tagfilter (https://github.github.com/gfm/#disallowed-raw-html-extension-).
// These tags put the HTML parser into raw-text, RCDATA, or plaintext mode, so leaving
// one for the sanitizer (#15) to remove lets an unclosed tag swallow the rest of the
// document first. github.com escapes the `<` instead, like cmark-gfm's tagfilter.c:
// https://github.com/github/cmark-gfm/blob/587a12bb54d95ac37241377e6ddc93ea0e45439b/extensions/tagfilter.c
const DISALLOWED_TAG_START =
  /<(?=\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:[\t\n\v\f\r >]|\/>))/gi;

function filterDisallowedRawHtml(md: MarkdownIt): void {
  md.core.ruler.push("gfm_tagfilter", (state) => {
    for (const token of state.tokens) {
      if (token.type === "html_block") {
        token.content = token.content.replace(DISALLOWED_TAG_START, "&lt;");
      }
      for (const child of token.children ?? []) {
        if (child.type === "html_inline") {
          child.content = child.content.replace(DISALLOWED_TAG_START, "&lt;");
        }
      }
    }
  });
}
