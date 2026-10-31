// highlight.js's own prebuilt bundle, not highlight.js/lib/common: both register the
// same 36 languages, but esbuild minifies lib/common to 160 KB, over #17's 150 KB
// entry budget (build.mjs), while the prebuilt bundle adds about 126 KB.
import hljs from "@highlightjs/cdn-assets/es/highlight.min.js";
import { alert } from "@mdit/plugin-alert";
import { fullEmoji } from "@mdit/plugin-emoji";
import { tasklist } from "@mdit/plugin-tasklist";
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
  // Plain emoji characters: github.com's <g-emoji> wrapper isn't on its own allowlist.
  md.use(fullEmoji);
  headingAnchors(md);

  return md;
}

// Syntax highlighting with GitHub's light and dark themes (#17, epic #3 decision q24).
// Like github.com, only a fence's declared language is highlighted: an absent or
// unknown language renders plain, never auto-detected. Returning "" tells
// markdown-it to escape the code itself.
function highlightFencedCode(code: string, language: string): string {
  if (!language || !hljs.getLanguage(language)) return "";
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

// The five alert types github.com supports, in its markup and classes, which
// github-markdown-css styles (https://github.com/orgs/community/discussions/16925).
function githubAlerts(md: MarkdownIt): void {
  md.use(alert, {
    // github.com titles every alert "Note", "Tip", … however `[!NOTE]` is cased.
    titleRenderer: (tokens, idx) => {
      const name = tokens[idx]?.markup ?? "";
      return `<p class="markdown-alert-title">${name.charAt(0).toUpperCase()}${name.slice(1)}</p>\n`;
    },
  });
  extendAllowlist({
    classes: {
      div: [
        "markdown-alert",
        "markdown-alert-note",
        "markdown-alert-tip",
        "markdown-alert-important",
        "markdown-alert-warning",
        "markdown-alert-caution",
      ],
      p: ["markdown-alert-title"],
    },
  });
}

// GFM's extended autolinks recognize scheme-less links only when they start with
// `www.` (https://github.github.com/gfm/#extended-www-autolink). linkify-it 6 has no
// www-only mode: fuzzy links are off by default, and turning them on also links bare
// `example.com`, which github.com leaves as text.
function restrictFuzzyLinksToWww(md: MarkdownIt): void {
  md.linkify.set({ fuzzyLink: true });
  const match = md.linkify.match.bind(md.linkify);
  md.linkify.match = (text) =>
    match(text)?.filter((link) => link.schema !== "" || /^www\./i.test(link.raw)) ?? null;
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
