// GFM conformance for the extensions github.com adds on top of CommonMark.
// Fixtures are vendored from cmark-gfm tag 0.29.0.gfm.13 (commit 587a12bb54d95ac37241377e6ddc93ea0e45439b):
// https://github.com/github/cmark-gfm/tree/587a12bb54d95ac37241377e6ddc93ea0e45439b/test

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createMarkdown } from "../src/markdown.ts";
import { parseSpecExamples, type SpecExample } from "./spec-examples.ts";

const IN_SCOPE_SECTIONS: Record<string, string[]> = {
  "spec.txt": [
    "Tables (extension)",
    "Strikethrough (extension)",
    "Autolinks (extension)",
    "Task list items (extension)",
    "Disallowed Raw HTML (extension)",
  ],
  // "Interop" only combines the in-scope extensions with each other.
  "extensions.txt": [
    "Tables",
    "Strikethroughs",
    "Autolinks",
    "Task lists",
    "HTML tag filter",
    "Interop",
  ],
};

// cmark-gfm marks examples whose output is unspecified; only "doesn't throw" is checked.
const IGNORED_OUTPUT = "<IGNORE>\n";

const knownFailures: Record<string, string> = JSON.parse(
  readFileSync(new URL("./gfm-known-failures.json", import.meta.url), "utf8"),
);

const examples: SpecExample[] = Object.entries(IN_SCOPE_SECTIONS).flatMap(([file, sections]) =>
  parseSpecExamples(
    file,
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"),
  ).filter((example) => sections.includes(example.section)),
);

const md = createMarkdown();

describe.each(Object.keys(IN_SCOPE_SECTIONS))("%s", (file) => {
  for (const example of examples.filter(({ id }) => id.startsWith(`${file}#`))) {
    const name = `${example.id} (${example.section})`;
    if (example.html === IGNORED_OUTPUT) {
      test(name, () => {
        md.render(example.markdown);
      });
    } else {
      // test.fails flips once a divergence is fixed, so stale entries can't linger.
      (knownFailures[example.id] ? test.fails : test)(name, () => {
        expect(normalizeHtml(md.render(example.markdown))).toBe(normalizeHtml(example.html));
      });
    }
  }
});

test("every known failure names an in-scope example and a reason", () => {
  const ids = new Set(examples.map(({ id }) => id));
  for (const [id, reason] of Object.entries(knownFailures)) {
    expect(ids, id).toContain(id);
    expect(reason.trim(), id).not.toBe("");
  }
});

const TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:="[^"]*")?)*)\s*\/?>/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:="([^"]*)")?/g;
const BOOLEAN_ATTRIBUTES: Record<string, true> = { checked: true, disabled: true };

// cmark-gfm's reference renderer and markdown-it serialize equivalent markup differently.
// This normalizes serialization only, never structure or text:
// - XHTML `<br />` vs HTML `<br>`, and attribute order.
// - `disabled=""` vs `disabled="disabled"`: the same boolean attribute.
// - `class` is dropped: github.com adds styling hooks (e.g. task-list-item) that the
//   reference renderer omits.
// - `id` on <input> is dropped: the tasklist plugin numbers checkboxes for <label for>.
// - `disabled` on <input> is dropped: Unmark's checkboxes tick the task in the Source, which
//   the spec leaves to implementors.
// - `data-source-line` is dropped: Unmark marks every block with its source line for Split
//   mode's scroll sync.
function normalizeHtml(html: string): string {
  return html.replace(TAG, (_tag, name: string, attributes: string) => {
    const kept = [...attributes.matchAll(ATTRIBUTE)]
      .map(([, attr = "", value]) => [attr, value] as const)
      .filter(
        ([attr]) =>
          attr !== "class" &&
          attr !== "data-source-line" &&
          !(name === "input" && (attr === "id" || attr === "disabled")),
      )
      .map(([attr, value]) => (BOOLEAN_ATTRIBUTES[attr] ? attr : `${attr}="${value ?? ""}"`))
      .sort();
    return `<${[name, ...kept].join(" ")}>`;
  });
}
