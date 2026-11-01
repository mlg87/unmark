// @vitest-environment jsdom

// Golden tests for the GitHub extras (#16): alerts, footnotes, heading anchors, emoji,
// and front matter. Each case runs the full pipeline the Preview runs
// (markdown-it → sanitize → DOM insert), so a class or attribute the sanitizer drops fails here.

import { beforeAll, describe, expect, test } from "vitest";
import "../src/index.ts";
import { withoutSourceLines } from "./without-source-lines.ts";

let article: Element;

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  article = document.querySelector("article.markdown-body") as Element;
});

async function render(markdown: string): Promise<string> {
  await window.unmark.render(markdown, { documentBaseURL: "file:///docs/" });
  return withoutSourceLines(article.innerHTML.trim());
}

const ANCHOR_ICON = '<span class="octicon octicon-link"></span>';

describe("alerts", () => {
  test.each([
    ["NOTE", "note", "Note", "info"],
    ["TIP", "tip", "Tip", "light-bulb"],
    ["IMPORTANT", "important", "Important", "report"],
    ["WARNING", "warning", "Warning", "alert"],
    ["CAUTION", "caution", "Caution", "stop"],
  ])("[!%s]", async (marker, type, title, octicon) => {
    expect(await render(`> [!${marker}]\n> Body text.`)).toBe(
      `<div class="markdown-alert markdown-alert-${type}">\n<p class="markdown-alert-title"><span class="octicon octicon-${octicon}" aria-hidden="true"></span>${title}</p>\n<p>Body text.</p>\n</div>`,
    );
  });

  test("the title doesn't depend on how the marker is cased", async () => {
    expect(await render("> [!warning]\n> x")).toContain(
      '<p class="markdown-alert-title"><span class="octicon octicon-alert" aria-hidden="true"></span>Warning</p>',
    );
  });

  test("an unknown type stays a blockquote", async () => {
    expect(await render("> [!DANGER]\n> x")).toBe(
      "<blockquote>\n<p>[!DANGER]\nx</p>\n</blockquote>",
    );
  });
});

describe("footnotes", () => {
  test("a reference and the footnote section", async () => {
    expect(await render("Claim[^1].\n\n[^1]: Source.")).toBe(
      [
        '<p>Claim<sup><a href="#fn-1" id="fnref-1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup>.</p>',
        '<section data-footnotes="" class="footnotes"><h2 id="footnote-label" class="sr-only">Footnotes</h2>',
        "<ol>",
        '<li id="fn-1">',
        '<p>Source. <a href="#fnref-1" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p>',
        "</li>",
        "</ol>",
        "</section>",
      ].join("\n"),
    );
  });

  test("a second reference to the same footnote gets its own id and back-reference", async () => {
    const html = await render("a[^n] b[^n]\n\n[^n]: Note.");
    expect(html).toContain('<a href="#fn-1" id="fnref-1-2" data-footnote-ref=""');
    expect(html).toContain(
      '<a href="#fnref-1-2" data-footnote-backref="" aria-label="Back to reference 1-2" class="data-footnote-backref">↩<sup>2</sup></a>',
    );
  });
});

describe("heading anchors", () => {
  test("duplicate headings get GitHub's unique ids", async () => {
    expect(await render("## A\n\n## A")).toBe(
      [
        `<h2 id="a"><a class="anchor" href="#a" aria-hidden="true">${ANCHOR_ICON}</a>A</h2>`,
        `<h2 id="a-1"><a class="anchor" href="#a-1" aria-hidden="true">${ANCHOR_ICON}</a>A</h2>`,
      ].join("\n"),
    );
  });

  test("ids restart with every render", async () => {
    await render("# A");
    expect(await render("# A")).toContain('<h1 id="a">');
  });

  test("outline() returns the headings in document order", async () => {
    await render("# Getting Started\n\nIntro.\n\n## Install `unmark`\n\n### Getting Started");
    expect(await window.unmark.outline()).toEqual([
      { level: 1, text: "Getting Started", id: "getting-started" },
      { level: 2, text: "Install unmark", id: "install-unmark" },
      { level: 3, text: "Getting Started", id: "getting-started-1" },
    ]);
  });
});

describe("emoji", () => {
  test.each([
    [":tada:", "🎉"],
    [":+1:", "👍"],
    [":heart:", "❤️"],
    [":rocket:", "🚀"],
    [":warning:", "⚠️"],
  ])("%s", async (shortcode, emoji) => {
    expect(await render(`Shipped ${shortcode}`)).toBe(`<p>Shipped ${emoji}</p>`);
  });

  test("an unknown shortcode stays text", async () => {
    expect(await render(":not_an_emoji:")).toBe("<p>:not_an_emoji:</p>");
  });
});

describe("front matter", () => {
  test("a key becomes a header cell and its value a body cell", async () => {
    expect(await render("---\ntitle: x\n---\n\nBody")).toBe(
      "<table>\n<thead>\n<tr><th>title</th></tr>\n</thead>\n<tbody>\n<tr><td>x</td></tr>\n</tbody>\n</table>\n<p>Body</p>",
    );
  });

  test("nested values show as inline JSON", async () => {
    expect(await render("---\ntags: [a, b]\nauthor: {name: M}\ndraft: false\n---")).toBe(
      '<table>\n<thead>\n<tr><th>tags</th><th>author</th><th>draft</th></tr>\n</thead>\n<tbody>\n<tr><td>["a","b"]</td><td>{"name":"M"}</td><td>false</td></tr>\n</tbody>\n</table>',
    );
  });

  test("invalid YAML shows the raw block as code", async () => {
    expect(await render("---\ntitle: [x\n---\n\nBody")).toBe(
      "<pre><code>title: [x\n</code></pre>\n<p>Body</p>",
    );
  });

  test("markup in keys and values is escaped", async () => {
    expect(await render('---\n"<b>k</b>": <img src=x onerror=alert(1)>\n---')).toBe(
      "<table>\n<thead>\n<tr><th>&lt;b&gt;k&lt;/b&gt;</th></tr>\n</thead>\n<tbody>\n<tr><td>&lt;img src=x onerror=alert(1)&gt;</td></tr>\n</tbody>\n</table>",
    );
  });
});
