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

test('render("home") puts both install paths and the facts in the install section', () => {
  const html = render("home");
  const install = html.slice(html.indexOf('id="install"'), html.indexOf("<footer"));
  expect(install).toContain("brew install mlg87/tap/unmark");
  expect(install).toMatch(
    /<a [^>]*href="https:\/\/example\.invalid\/Unmark-0\.0\.0\.dmg"[^>]*>Download Unmark <!-- -->0\.0\.0<\/a>/,
  );
  for (const fact of [
    "macOS 14 Sonoma or later",
    "Apple silicon and Intel",
    "Updates itself",
    "Free and open source",
  ]) {
    expect(install).toContain(fact);
  }
});

test("the footer links GitHub, the release notes, and the license on both pages", () => {
  for (const page of ["home", "not-found"] as const) {
    const footer = render(page).split("<footer")[1];
    expect(footer).toContain('href="https://github.com/mlg87/unmark"');
    expect(footer).toContain('href="https://github.com/mlg87/unmark/releases"');
    expect(footer).toContain('href="https://github.com/mlg87/unmark/blob/main/LICENSE"');
  }
});

test('render("not-found") has its heading and a link home', () => {
  const html = render("not-found");
  expect(html.replace(/<[^>]*>/g, "")).toContain("This page is unmarked.");
  expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to unmarkeditor\.com<\/a>/);
});
