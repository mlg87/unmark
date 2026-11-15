import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { render } from "../src/entry-server.tsx";
import { EXAMPLE_TEXT } from "../src/scenes/Skills.tsx";

test('render("home") has the five skills, the install command, and the polish example', () => {
  const html = render("home");
  const skills = html.slice(html.indexOf('id="skills"'), html.indexOf('id="appearance"'));
  for (const text of [
    "unmark-docs",
    "unmark-polish",
    "unmark-api-docs",
    "unmark-meeting-docs",
    "unmark-planning-docs",
    "unmark --install-skills",
    "Before",
    "After",
  ]) {
    expect(skills).toContain(text);
  }
});

// The examples must stay what the agent wrote in #235's runs, not a tidier version of it.
test("every example run is text from its fixture", () => {
  expect(Object.keys(EXAMPLE_TEXT).sort()).toEqual([
    "polish-after.md",
    "polish-before.md",
    "recap.md",
  ]);
  for (const [file, runs] of Object.entries(EXAMPLE_TEXT)) {
    const fixture = readFileSync(
      new URL(`../../docs/fixtures/skills/${file}`, import.meta.url),
      "utf8",
    ).replace(/[*_`]/g, "");
    for (const run of runs) {
      expect(fixture, `${file}: ${run}`).toContain(run);
    }
  }
});
