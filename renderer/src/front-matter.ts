// YAML front matter as github.com shows it (#16): a table with one column per key,
// keys in the header row and values in the body row.

import type { MarkdownIt } from "markdown-it";
import frontMatterPlugin from "markdown-it-front-matter";
import { parseDocument } from "yaml";

export function frontMatter(md: MarkdownIt): void {
  const { escapeHtml } = md.utils;

  // The plugin hands raw YAML to a callback; rendering reads it from the token instead,
  // so each render handles only its own front matter.
  md.use(frontMatterPlugin, () => {});
  md.renderer.rules.front_matter = (tokens, idx) => {
    const raw = String(tokens[idx]?.meta ?? "");
    const fields = parseMapping(raw);
    if (!fields) return `<pre><code>${escapeHtml(raw)}\n</code></pre>\n`;
    if (fields.length === 0) return "";
    const header = fields.map(([key]) => `<th>${escapeHtml(key)}</th>`).join("");
    const values = fields.map(([, value]) => `<td>${escapeHtml(value)}</td>`).join("");
    return `<table>\n<thead>\n<tr>${header}</tr>\n</thead>\n<tbody>\n<tr>${values}</tr>\n</tbody>\n</table>\n`;
  };
}

/** Key/display-value pairs, or `undefined` when `raw` isn't a valid YAML mapping. */
function parseMapping(raw: string): [string, string][] | undefined {
  const document = parseDocument(raw);
  if (document.errors.length > 0) return undefined;
  let data: unknown;
  try {
    // Throws on alias bombs (yaml's maxAliasCount).
    data = document.toJS();
  } catch {
    return undefined;
  }
  if (data === null || data === undefined) return [];
  if (typeof data !== "object" || Array.isArray(data)) return undefined;
  return Object.entries(data).map(([key, value]) => [key, displayValue(value)]);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Nested mappings and lists show as inline JSON, one table row deep (#16).
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
