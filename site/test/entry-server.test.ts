import { expect, test } from "vitest";
import { render } from "../src/entry-server.tsx";

test('render("home") shows the headline and links the release DMG', () => {
  const html = render("home");
  expect(html).toContain("Markdown, the way GitHub shows it.");
  expect(html).toContain("https://example.invalid/Unmark-0.0.0.dmg");
});
