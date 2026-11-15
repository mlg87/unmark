// @vitest-environment jsdom

// The documentation skills in skills/ (#230): each holds to the Agent Skills format
// (https://agentskills.io/specification), carries unmark-docs's two references unchanged, and
// its assets and markdown examples render in the Preview with nothing lost. Skill folders are
// found at run time, so a new skill needs no change here.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import hljs from "@highlightjs/cdn-assets/es/highlight.min.js";
import markdownit, { type Token } from "markdown-it";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { parse as parseYaml } from "yaml";

// jsdom can't lay out the SVG text Mermaid measures; see diagrams.test.ts.
const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));

const SKILLS = resolve(import.meta.dirname, "../../skills");
const ORIGINALS = join(SKILLS, "unmark-docs", "references");
const SHARED_REFERENCES = ["syntax.md", "plain-language.md"];
// Skills must work in any agent, so they name none, and use none's tool or argument syntax.
const PRODUCT_NAMES = /\b(Claude|Anthropic|Codex|OpenAI|ChatGPT|Gemini|Qwen|Copilot)\b/;
const AGENT_SYNTAX = [
  "$ARGUMENTS",
  "allowed-tools",
  "TodoWrite",
  "AskUserQuestion",
  "apply_patch",
  "activate_skill",
];
// The five types github.com renders. A marker of another type, like [!DANGER], is still counted
// so that the alert check fails on it.
const ALERT_MARKER = /^\[![A-Za-z]+\][ \t]*(\n|$)/;
const FRONT_MATTER = /^---\n([\s\S]*?)\n---(\n|$)/;
const URL_PATTERN = /https?:\/\/[^\s<>()[\]`"']+/g;
const NUMBER = /\d+(?:[.,]\d+)*/g;

// Parses source structure only. The Preview's own pipeline renders, in renderInPreview.
const parser = markdownit({ html: true });

const skills = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function filesIn(folder: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(folder);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

/**
 * A skill's assets/before.md is a document with the faults the skill repairs (#231), so it is
 * exempt from the checks of what a good document looks like: no semicolons in prose, a language
 * on every fence, one h1, no skipped heading level, and no broken #fragment link.
 */
function isFaultExample(path: string): boolean {
  return path.endsWith(`${sep}assets${sep}before.md`);
}

function tokensOf(markdown: string): Token[] {
  return parser.parse(markdown.replace(FRONT_MATTER, ""), {});
}

function withChildren(tokens: Token[]): Token[] {
  return tokens.flatMap((token) => [token, ...withChildren(token.children ?? [])]);
}

/** The text a reader sees, outside fenced code, code spans, and HTML entities. */
function proseOf(markdown: string): string[] {
  return withChildren(tokensOf(markdown)).flatMap((token) => {
    if (token.type === "text") return [token.content];
    if (token.type === "html_block" || token.type === "html_inline") {
      return [token.content.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, "")];
    }
    return [];
  });
}

function fenceLanguages(markdown: string): string[] {
  return tokensOf(markdown)
    .filter((token) => token.type === "fence")
    .map((token) => token.info.trim().split(/\s+/)[0] ?? "");
}

function alertMarkers(markdown: string): number {
  const tokens = tokensOf(markdown);
  return tokens.filter(
    (token, index) =>
      token.type === "blockquote_open" &&
      tokens[index + 1]?.type === "paragraph_open" &&
      ALERT_MARKER.test(tokens[index + 2]?.content ?? ""),
  ).length;
}

/** Every raw HTML element in the source, outside code, with its attribute names. */
function rawElements(markdown: string): { tag: string; attributes: string[] }[] {
  return withChildren(tokensOf(markdown))
    .filter((token) => token.type === "html_block" || token.type === "html_inline")
    .flatMap((token) => {
      const template = document.createElement("template");
      template.innerHTML = token.content;
      return [...template.content.querySelectorAll("*")].map((element) => ({
        tag: element.localName,
        attributes: element.getAttributeNames(),
      }));
    });
}

function linksOf(markdown: string): string[] {
  return withChildren(tokensOf(markdown)).flatMap((token) => {
    const target = token.attrGet(token.type === "image" ? "src" : "href");
    return (token.type === "link_open" || token.type === "image") && target ? [String(target)] : [];
  });
}

/**
 * Renders `markdown` the way the Preview opens a file. Each document gets a fresh renderer:
 * a second render into the same one counts as an edit, and waits 1.5 s for the typing to pause
 * before it puts the rest of the document on the page.
 */
async function renderInPreview(markdown: string): Promise<Element> {
  vi.resetModules();
  document.body.innerHTML = '<article class="markdown-body"></article>';
  await import("../src/index.ts");
  await window.unmark.render(markdown, { documentBaseURL: "file:///skills/" });
  // Settles once the whole document, diagrams too, is on the page.
  await window.unmark.outline();
  return document.querySelector("article.markdown-body") as Element;
}

beforeEach(() => {
  mermaid.render.mockReset();
  mermaid.render.mockImplementation(async (id: string) => ({ svg: `<svg id="${id}"></svg>` }));
});

describe.each(skills)("%s", (skill) => {
  const folder = join(SKILLS, skill);
  const skillFile = readFileSync(join(folder, "SKILL.md"), "utf8");
  const markdownFiles = filesIn(folder).filter((path) => path.endsWith(".md"));

  test("SKILL.md's frontmatter has exactly name, description, and license", () => {
    const yaml = FRONT_MATTER.exec(skillFile)?.[1];
    expect(yaml, "SKILL.md starts with a --- block").toBeDefined();
    const frontmatter = parseYaml(yaml ?? "");
    expect(Object.keys(frontmatter).sort()).toEqual(["description", "license", "name"]);
    expect(frontmatter.name).toBe(skill);
    expect(frontmatter.name).toMatch(/^unmark-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(typeof frontmatter.description).toBe("string");
    expect(frontmatter.description).not.toMatch(/\n/);
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
    expect(frontmatter.description).toContain("Use when");
    expect(frontmatter.license).toBe("MIT");
  });

  test("SKILL.md has at most 500 lines", () => {
    expect(skillFile.replace(/\n$/, "").split("\n").length).toBeLessThanOrEqual(500);
  });

  test("SKILL.md links only to files in the skill, at most one folder down, and to all of them", () => {
    const linked = linksOf(skillFile)
      .filter((link) => !/^[a-z][a-z\d+.-]*:/i.test(link) && !link.startsWith("#"))
      .map((link) => resolve(folder, decodeURIComponent(link.replace(/[#?].*$/, ""))));
    for (const path of linked) {
      const inSkill = relative(folder, path);
      expect(inSkill, `${inSkill} is inside the skill`).not.toMatch(/^\.\.|^\//);
      expect(inSkill.split(sep).length, `${inSkill} is at most one folder down`).toBeLessThan(3);
      expect(statSync(path, { throwIfNoEntry: false })?.isFile(), `${inSkill} exists`).toBe(true);
    }
    const bundled = ["references", "assets"].flatMap((name) => filesIn(join(folder, name)));
    expect(
      bundled.filter((path) => !linked.includes(path)).map((path) => relative(folder, path)),
    ).toEqual([]);
  });

  test.each(SHARED_REFERENCES)("references/%s is unmark-docs's copy, byte for byte", (name) => {
    expect(readFileSync(join(folder, "references", name))).toEqual(
      readFileSync(join(ORIGINALS, name)),
    );
  });

  test("no file names an agent product or uses an agent's own syntax", () => {
    for (const path of filesIn(folder)) {
      const text = readFileSync(path, "utf8");
      const where = relative(SKILLS, path);
      expect(PRODUCT_NAMES.exec(text)?.[0], where).toBeUndefined();
      expect(
        AGENT_SYNTAX.filter((syntax) => text.includes(syntax)),
        where,
      ).toEqual([]);
    }
  });

  test("SKILL.md tells the agent to open the result in Unmark", () => {
    const section = skillFile.split(/^## /m).find((part) => part.startsWith("Show the result\n"));
    expect(section).toContain("command -v unmark");
    expect(section).toContain("unmark <file>");
  });

  test("no markdown file has a semicolon in its prose", () => {
    for (const path of markdownFiles.filter((path) => !isFaultExample(path))) {
      const semicolons = proseOf(readFileSync(path, "utf8")).filter((text) => text.includes(";"));
      expect(semicolons, relative(SKILLS, path)).toEqual([]);
    }
  });

  // Every asset, and every `markdown` fence in a reference, as the Preview renders it.
  const documents = [
    ...filesIn(join(folder, "assets"))
      .filter((path) => path.endsWith(".md"))
      .map((path) => ({
        name: relative(folder, path),
        markdown: readFileSync(path, "utf8"),
        asset: true,
        faults: isFaultExample(path),
      })),
    ...filesIn(join(folder, "references"))
      .filter((path) => path.endsWith(".md"))
      .flatMap((path) =>
        tokensOf(readFileSync(path, "utf8"))
          .filter((token) => token.type === "fence" && token.info.trim() === "markdown")
          .map((token) => ({
            name: `${relative(folder, path)}:${(token.map?.[0] ?? 0) + 1}`,
            markdown: token.content,
            asset: false,
            faults: false,
          })),
      ),
  ];

  test.each(documents)("$name renders in the Preview with nothing lost", async (document) => {
    const { markdown, asset, faults } = document;
    const article = await renderInPreview(markdown);

    const markers = alertMarkers(markdown);
    expect(article.querySelectorAll(".markdown-alert"), "every alert renders").toHaveLength(
      markers,
    );
    if (asset) expect(markers, "an asset has at most 2 alerts").toBeLessThanOrEqual(2);

    const languages = fenceLanguages(markdown);
    expect(mermaid.render, "every diagram is drawn").toHaveBeenCalledTimes(
      languages.filter((language) => language === "mermaid").length,
    );
    expect(
      languages.filter(
        (language) =>
          language !== "mermaid" &&
          language !== "math" &&
          !hljs.getLanguage(language) &&
          !(faults && language === ""),
      ),
      "every fence has a language the Preview highlights",
    ).toEqual([]);

    const dropped = rawElements(markdown).filter(
      ({ tag, attributes }) =>
        ![...article.querySelectorAll(tag)].some((element) =>
          attributes.every((attribute) => element.hasAttribute(attribute)),
        ),
    );
    expect(dropped, "the sanitizer keeps every raw HTML element").toEqual([]);

    if (!asset || faults) return;
    const headings = [...article.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const levels = headings.map((heading) => Number(heading.localName[1]));
    expect(
      levels.filter((level) => level === 1),
      "one h1",
    ).toHaveLength(1);
    expect(
      levels.filter((level, index) => level > (levels[index - 1] ?? 0) + 1),
      "no heading skips a level",
    ).toEqual([]);
    const headingIds = new Set(headings.map((heading) => heading.id));
    const brokenFragments = [
      ...article.querySelectorAll<HTMLAnchorElement>(
        'a[href^="#"]:not([data-footnote-ref]):not([data-footnote-backref])',
      ),
    ]
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => !headingIds.has(`user-content-${decodeURIComponent(href.slice(1))}`));
    expect(brokenFragments, "every #fragment link has its heading").toEqual([]);
  });
});

/** What a polished document must keep word for word: its URLs, its code, and its numbers. */
function keptContentOf(markdown: string) {
  const tokens = withChildren(tokensOf(markdown));
  const fences = tokens.filter((token) => token.type === "fence").map((token) => token.content);
  return {
    // Trailing punctuation ends the sentence, not the URL.
    urls: [...markdown.matchAll(URL_PATTERN)].map(([url]) => url.replace(/[.,;:!?]+$/, "")),
    fences,
    codeSpans: tokens.filter((token) => token.type === "code_inline").map((token) => token.content),
    fenceLines: fences.flatMap((fence) => fence.split("\n")),
    numbers: proseOf(markdown).flatMap((text) => text.match(NUMBER) ?? []),
  };
}

// A skill whose assets hold a before.md and an after.md shows a polish of one document (#231).
// The polish may change the form, so after.md may have more, but never less.
const polishExamples = skills.filter((skill) =>
  ["before.md", "after.md"].every((name) =>
    statSync(join(SKILLS, skill, "assets", name), { throwIfNoEntry: false })?.isFile(),
  ),
);

describe.each(polishExamples)("%s: assets/after.md keeps what before.md says", (skill) => {
  const read = (name: string) =>
    keptContentOf(readFileSync(join(SKILLS, skill, "assets", name), "utf8"));
  const before = read("before.md");
  const after = read("after.md");

  test("every URL", () => {
    expect(before.urls.filter((url) => !after.urls.includes(url))).toEqual([]);
  });

  test("every fenced block's contents", () => {
    expect(before.fences.filter((fence) => !after.fences.includes(fence))).toEqual([]);
  });

  // Steps written as prose become a numbered list with each command in its own fence.
  test("every code span, as a code span or as a line of a fenced block", () => {
    expect(
      before.codeSpans.filter(
        (span) => !after.codeSpans.includes(span) && !after.fenceLines.includes(span),
      ),
    ).toEqual([]);
  });

  test("every number in the prose", () => {
    expect(before.numbers.filter((number) => !after.numbers.includes(number))).toEqual([]);
  });
});
