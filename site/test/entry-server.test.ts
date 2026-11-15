import { expect, test } from "vitest";
import { render } from "../src/entry-server.tsx";

test('render("home") shows the headline and links the release DMG', () => {
  const html = render("home");
  expect(html).toContain("Markdown, the way GitHub shows it.");
  expect(html).toContain("https://example.invalid/Unmark-0.0.0.dmg");
});

test('render("home") has every scene and leaves the motion mode to the browser', () => {
  const html = render("home");
  for (const id of [
    "hero",
    "unmark",
    "github",
    "split",
    "outline",
    "terminal",
    "appearance",
    "install",
  ]) {
    expect(html).toContain(`id="${id}"`);
  }
  // The inline script in index.html sets it; prerendered markup must stay static for no-JS visitors.
  expect(html).not.toContain("data-motion");
});
