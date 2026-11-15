import { expect, test } from "vitest";
import { head, render } from "../src/entry-server.tsx";

test('render("home") has one <h1>, the headline, and links the release DMG', () => {
  const html = render("home");
  // The headline's words are separate spans (#184), so compare the text without its tags.
  const headings = html.match(/<h1[\s>][\s\S]*?<\/h1>/g) ?? [];
  expect(headings.map((heading) => heading.replace(/<[^>]*>/g, ""))).toEqual([
    "Markdown, the way GitHub shows it.",
  ]);
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

test('head("home") carries JSON-LD for the release, and head("not-found") only noindex', () => {
  const jsonLd = head("home").match(/<script type="application\/ld\+json">(.*)<\/script>/);
  const app = JSON.parse(jsonLd?.[1] ?? "");
  expect(app).toMatchObject({
    "@type": "SoftwareApplication",
    softwareVersion: "0.0.0",
    downloadUrl: "https://example.invalid/Unmark-0.0.0.dmg",
  });

  const notFound = head("not-found");
  expect(notFound).not.toContain("application/ld+json");
  expect(notFound).toContain('<meta name="robots" content="noindex" />');
});
