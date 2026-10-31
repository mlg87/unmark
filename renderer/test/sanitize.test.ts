// @vitest-environment jsdom

// Golden tests for the sanitize step (#15). Each case runs the full pipeline the
// Preview runs (markdown-it → sanitize → DOM insert) and checks the resulting DOM.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import "../src/index.ts";
import { parseSpecExamples } from "./spec-examples.ts";

let article: Element;

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
});

async function render(markdown: string): Promise<string> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
  return article.innerHTML.trim();
}

describe("removes what GitHub's allowlist doesn't allow", () => {
  test.each([
    ["<script>", "<script>alert(1)</script>\n\ntext", "<p>text</p>"],
    ["<style>", "<style>body { display: none }</style>\n\ntext", "<p>text</p>"],
    ["<iframe>", '<iframe src="https://example.com"></iframe>\n\ntext', "<p>text</p>"],
    ["inline <script>", "a <script>alert(1)</script> b", "<p>a  b</p>"],
    ["onerror=", '<img src="x.png" onerror="alert(1)">', '<img src="x.png">'],
    ["onclick=", '<p onclick="alert(1)">x</p>', "<p>x</p>"],
    ["javascript: href", '<a href="javascript:alert(1)">x</a>', "<p><a>x</a></p>"],
    ["mixed-case javascript: href", '<a href="JaVaScRiPt:alert(1)">x</a>', "<p><a>x</a></p>"],
    [
      "javascript: href split by an entity tab",
      '<a href="java&#x09;script:alert(1)">x</a>',
      "<p><a>x</a></p>",
    ],
    ["javascript: link in markdown", "[x](javascript:alert(1))", "<p>[x](javascript:alert(1))</p>"],
    ["data: image", '<img src="data:image/svg+xml;base64,PHN2Zz4=">', "<img>"],
    ["mailto: image", '<img src="mailto:a@example.com">', "<img>"],
    ["file: href", '<a href="file:///etc/passwd">x</a>', "<p><a>x</a></p>"],
    ["style attribute", '<p style="position:fixed">x</p>', "<p>x</p>"],
    ["data-* and other aria-* attributes", '<p data-x="1" aria-live="polite">x</p>', "<p>x</p>"],
    [
      "an attribute on the wrong element",
      '<img href="https://example.com" src="x.png">',
      '<img src="x.png">',
    ],
    ["classes no plugin registered", '<p class="contains-task-list">x</p>', "<p>x</p>"],
    ["<form> and <svg>", '<form action="/x"><svg><circle /></svg>x</form>', "x"],
  ])("%s", async (_name, markdown, expected) => {
    expect(await render(markdown)).toBe(expected);
  });
});

describe("keeps what GitHub's allowlist allows", () => {
  test.each([
    [
      "<details><summary>",
      "<details open>\n<summary>More</summary>\n\nBody\n\n</details>",
      '<details open="">\n<summary>More</summary>\n<p>Body</p>\n</details>',
    ],
    ["<kbd>", "Press <kbd>Ctrl</kbd>+<kbd>C</kbd>", "<p>Press <kbd>Ctrl</kbd>+<kbd>C</kbd></p>"],
    [
      '<img align="center" width="200">',
      '<p align="center"><img align="center" width="200" src="logo.png" alt="Logo"></p>',
      '<p align="center"><img align="center" width="200" src="logo.png" alt="Logo"></p>',
    ],
    [
      "<picture><source>",
      '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="https://example.com/dark.png 1x, dark@2x.png 2x">\n<img src="light.png" alt="Logo">\n</picture>',
      '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="https://example.com/dark.png 1x, dark@2x.png 2x">\n<img src="light.png" alt="Logo">\n</picture>',
    ],
    [
      "relative, https, mailto, and fragment links",
      "[a](other.md) [b](https://example.com) <a@example.com> [c](#top)",
      '<p><a href="other.md">a</a> <a href="https://example.com">b</a> <a href="mailto:a@example.com">a@example.com</a> <a href="#top">c</a></p>',
    ],
    [
      "non-URL attribute values that look like a scheme",
      '<abbr title="note: x">N</abbr>',
      '<p><abbr title="note: x">N</abbr></p>',
    ],
    [
      "task-list markup the tasklist plugin registered",
      "- [x] done\n- [ ] todo",
      '<ul class="contains-task-list">\n<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" id="task-item-0" checked="checked" disabled="disabled"> done</li>\n<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" id="task-item-1" disabled="disabled"> todo</li>\n</ul>',
    ],
  ])("%s", async (_name, markdown, expected) => {
    expect(await render(markdown)).toBe(expected);
  });
});

// GFM's tagfilter escapes these tags (https://github.github.com/gfm/#disallowed-raw-html-extension-);
// the allowlist removes them instead, so the parity check is that none reach the DOM.
const TAGFILTER_TAGS = [
  "title",
  "textarea",
  "style",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "script",
  "plaintext",
];

const tagfilterExamples = [
  ["spec.txt", "Disallowed Raw HTML (extension)"],
  ["extensions.txt", "HTML tag filter"],
].flatMap(([file = "", section]) =>
  // jsdom replaces the global URL, which node:fs doesn't accept as a file URL.
  parseSpecExamples(file, readFileSync(join(import.meta.dirname, "fixtures", file), "utf8"))
    .filter((example) => example.section === section)
    .map(({ id, markdown }) => [id, markdown]),
);

describe("tagfilter parity: no disallowed element reaches the DOM", () => {
  test.each(TAGFILTER_TAGS)("<%s> as a block and inline", async (tag) => {
    await render(
      `<${tag}>\nblock\n</${tag}>\n\ninline <${tag}>x</${tag}> and <${tag.toUpperCase()}>`,
    );
    expect(article.querySelector(TAGFILTER_TAGS.join(","))).toBeNull();
  });

  test.each(tagfilterExamples)("%s", async (_id, markdown) => {
    await render(markdown ?? "");
    expect(article.querySelector(TAGFILTER_TAGS.join(","))).toBeNull();
  });

  test("the spec's tagfilter examples were found", () => {
    expect(tagfilterExamples).toHaveLength(2);
  });
});
