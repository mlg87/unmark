// Parses the example blocks out of cmark-gfm's spec.txt / extensions.txt.
// Format: https://github.com/github/cmark-gfm/blob/master/test/spec_tests.py

export interface SpecExample {
  /** `<file>#<n>`, n counting examples from 1 across the whole file (spec.txt matches "Example n" on github.github.com/gfm). */
  id: string;
  section: string;
  markdown: string;
  html: string;
}

const FENCE = "`".repeat(32);

export function parseSpecExamples(fileName: string, text: string): SpecExample[] {
  const examples: SpecExample[] = [];
  let section = "";
  let state: "prose" | "markdown" | "html" = "prose";
  let markdown: string[] = [];
  let html: string[] = [];

  for (const line of text.split("\n")) {
    if (state === "prose") {
      if (line.startsWith(`${FENCE} example`)) {
        state = "markdown";
        markdown = [];
        html = [];
      } else {
        const heading = /^#{1,6} (.*)$/.exec(line)?.[1];
        if (heading) section = heading.trim();
      }
    } else if (line === FENCE) {
      examples.push({
        id: `${fileName}#${examples.length + 1}`,
        section,
        markdown: untab(markdown),
        html: untab(html),
      });
      state = "prose";
    } else if (state === "markdown" && line === ".") {
      state = "html";
    } else {
      (state === "markdown" ? markdown : html).push(line);
    }
  }
  return examples;
}

// The spec writes tabs as → so they survive editors.
function untab(lines: string[]): string {
  return lines
    .map((line) => `${line}\n`)
    .join("")
    .replaceAll("→", "\t");
}
