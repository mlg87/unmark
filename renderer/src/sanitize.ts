// Sanitizes rendered markdown against GitHub's raw-HTML allowlist (#15), so a
// downloaded document can't run script in the Preview (epic #3, decision q19).
//
// The allowlist is html-pipeline's SanitizationFilter::DEFAULT_CONFIG, translated
// from commit 5470e4ebeba1cd44e12c4ac4df8217c291eba14a:
// https://github.com/gjtorikian/html-pipeline/blob/5470e4ebeba1cd44e12c4ac4df8217c291eba14a/lib/html_pipeline/sanitization_filter.rb
// Its `a[href]` protocols are Selma's VALID_PROTOCOLS (http, https, mailto, relative):
// https://github.com/gjtorikian/selma/blob/7c87013d89dec5814a53326a6701ecb40603646a/lib/selma/sanitizer/config/default.rb
//
// One exception: Mermaid diagrams (#19). The sanitizer sees only their escaped source
// in <pre data-mermaid>. diagrams.ts later replaces that with Mermaid's <svg>, which
// this allowlist would drop, so the SVG is inserted after sanitizing. Mermaid's
// securityLevel 'strict' escapes the labels and disables click handlers instead.

import createDOMPurify, { type Config, type DOMPurify } from "dompurify";

// biome-ignore format: one entry per line would make html-pipeline's lists 140 lines.
const GITHUB_ELEMENTS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "br", "b", "i", "strong", "em", "a", "pre", "code",
  "img", "tt", "div", "ins", "del", "sup", "sub", "p", "picture", "ol", "ul", "table",
  "thead", "tbody", "tfoot", "blockquote", "dl", "dt", "dd", "kbd", "q", "samp", "var",
  "hr", "ruby", "rt", "rp", "li", "tr", "td", "th", "s", "strike", "summary", "details",
  "caption", "figure", "figcaption", "abbr", "bdo", "cite", "dfn", "mark", "small",
  "source", "span", "time", "wbr",
];

const GITHUB_ELEMENT_ATTRIBUTES: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "longdesc", "loading", "alt"],
  div: ["itemscope", "itemtype"],
  blockquote: ["cite"],
  del: ["cite"],
  ins: ["cite"],
  q: ["cite"],
  source: ["srcset"],
};

// biome-ignore format: see GITHUB_ELEMENTS.
const GITHUB_GLOBAL_ATTRIBUTES = [
  "abbr", "accept", "accept-charset", "accesskey", "action", "align", "alt",
  "aria-describedby", "aria-hidden", "aria-label", "aria-labelledby", "axis", "border",
  "char", "charoff", "charset", "checked", "clear", "cols", "colspan", "compact", "coords",
  "datetime", "dir", "disabled", "enctype", "for", "frame", "headers", "height", "hreflang",
  "hspace", "id", "ismap", "label", "lang", "maxlength", "media", "method", "multiple",
  "name", "nohref", "noshade", "nowrap", "open", "progress", "prompt", "readonly", "rel",
  "rev", "role", "rows", "rowspan", "rules", "scope", "selected", "shape", "size", "span",
  "start", "summary", "tabindex", "title", "type", "usemap", "valign", "value", "width",
  "itemprop",
];

const LINK_PROTOCOLS = urlPattern(["http", "https", "mailto"]);
const RESOURCE_PROTOCOLS = urlPattern(["http", "https"]);

// URL attributes and the URLs they accept, per element.
const URL_PATTERNS: Record<string, Record<string, RegExp>> = {
  a: { href: LINK_PROTOCOLS },
  img: { src: RESOURCE_PROTOCOLS, longdesc: RESOURCE_PROTOCOLS },
  blockquote: { cite: RESOURCE_PROTOCOLS },
  del: { cite: RESOURCE_PROTOCOLS },
  ins: { cite: RESOURCE_PROTOCOLS },
  q: { cite: RESOURCE_PROTOCOLS },
  // Not in html-pipeline, whose Selma backend strips any srcset containing "://".
  // github.com keeps absolute srcsets: its docs build light/dark images from
  // <source srcset="https://…"> (https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#specifying-the-theme-an-image-is-shown-to).
  source: { srcset: RESOURCE_PROTOCOLS },
};

export interface AllowlistExtension {
  /** Elements to allow, each with the attributes it may carry beyond GitHub's global ones. */
  elements?: Record<string, readonly string[]>;
  /**
   * Class names an element may carry: exact names, or anchored (`^…$`) patterns for
   * generated families such as highlight.js's scopes. Every other class is removed.
   */
  classes?: Record<string, readonly (string | RegExp)[]>;
  /** Attributes any allowed element may carry, like GitHub's global ones. */
  attributes?: readonly string[];
}

const allowedElements = new Set(GITHUB_ELEMENTS);
const globalAttributes = new Set(GITHUB_GLOBAL_ATTRIBUTES);
const elementAttributes = new Map(
  Object.entries(GITHUB_ELEMENT_ATTRIBUTES).map(([tag, names]) => [tag, new Set(names)]),
);
const elementClasses = new Map<string, Set<string | RegExp>>();

/**
 * Widens the allowlist for markup a renderer plugin emits itself. Plugins call this
 * next to their `md.use()` so every addition to GitHub's allowlist is explicit and
 * reviewable in one place. Raw HTML in a document gets the same additions.
 */
export function extendAllowlist({
  elements = {},
  classes = {},
  attributes = [],
}: AllowlistExtension): void {
  for (const [tag, names] of Object.entries(elements)) {
    allowedElements.add(tag);
    addAll(elementAttributes, tag, names);
  }
  for (const [tag, names] of Object.entries(classes)) {
    addAll(elementClasses, tag, names);
  }
  for (const name of attributes) globalAttributes.add(name);
}

function addAll<T>(map: Map<string, Set<T>>, key: string, values: readonly T[]): void {
  const set = map.get(key) ?? new Set();
  for (const value of values) set.add(value);
  map.set(key, set);
}

/** Parses `html` and returns only what the allowlist permits, ready to insert. */
export function sanitize(html: string): DocumentFragment {
  return purifier().sanitize(html, purifyConfig());
}

let instance: DOMPurify | undefined;

// Created on first use: DOMPurify needs a window, and the markdown-only tests run
// without one.
function purifier(): DOMPurify {
  if (!instance) {
    instance = createDOMPurify(window);
    instance.addHook("uponSanitizeAttribute", (element, event) => {
      event.keepAttr = keepAttribute(element.localName, event.attrName, event);
    });
  }
  return instance;
}

function purifyConfig(): Config & { RETURN_DOM_FRAGMENT: true } {
  const attributes = new Set(globalAttributes);
  for (const names of elementAttributes.values()) for (const name of names) attributes.add(name);
  if (elementClasses.size > 0) attributes.add("class");
  const urlAttributes = new Set(Object.values(URL_PATTERNS).flatMap(Object.keys));

  return {
    ALLOWED_TAGS: [...allowedElements],
    // DOMPurify's attribute allowlist is global; keepAttribute() narrows it per element.
    ALLOWED_ATTR: [...attributes],
    // The widest of URL_PATTERNS; keepAttribute() narrows it per element.
    ALLOWED_URI_REGEXP: LINK_PROTOCOLS,
    // Without this, DOMPurify applies ALLOWED_URI_REGEXP to every attribute and
    // would drop non-URL values that look like a scheme, e.g. abbr="note: x".
    ADD_URI_SAFE_ATTR: [...attributes].filter((name) => !urlAttributes.has(name)),
    // GitHub allows four aria-* attributes and no data-* attributes.
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    // Insert DOMPurify's own parse instead of serializing it and parsing again,
    // which is where mutation-XSS lives.
    RETURN_DOM_FRAGMENT: true,
  };
}

function keepAttribute(tag: string, name: string, event: { attrValue: string }): boolean {
  if (name === "class") {
    const allowed = [...(elementClasses.get(tag) ?? [])];
    const kept = event.attrValue
      .split(/\s+/)
      .filter((token) =>
        allowed.some((entry) => (typeof entry === "string" ? entry === token : entry.test(token))),
      );
    event.attrValue = kept.join(" ");
    return kept.length > 0;
  }
  if (!globalAttributes.has(name) && !elementAttributes.get(tag)?.has(name)) {
    return false;
  }
  const pattern = URL_PATTERNS[tag]?.[name];
  if (!pattern) return true;
  // A srcset is a comma-separated list of "<url> <descriptor>" candidates.
  const urls =
    name === "srcset"
      ? event.attrValue.split(",").map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
      : [event.attrValue];
  return urls.every((url) => pattern.test(url.replace(URL_IGNORED_CHARACTERS, "")));
}

// Characters browsers drop or ignore when reading a URL's scheme (e.g. "java\tscript:"),
// as DOMPurify strips them before its own URI check.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const URL_IGNORED_CHARACTERS = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g;

/**
 * Matches a URL with one of `protocols`, or a relative URL: every html-pipeline
 * protocol list includes :relative. A URL is relative when it has no scheme, per the
 * URL spec. Selma instead requires a "/" or "#" before any ":", which would strip
 * src="image.png"; github.com renders such images.
 */
function urlPattern(protocols: string[]): RegExp {
  return new RegExp(`^(?:(?:${protocols.join("|")}):|(?![a-z][a-z\\d+.\\-]*:))`, "i");
}
