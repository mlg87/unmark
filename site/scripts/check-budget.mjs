// Fails the build when the page outgrows its size budget (unmark-2rg.12), the way the renderer's
// build holds its entry chunk to one (renderer/build.mjs). Runs last in `build`, against dist/.
import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url);

// What a visitor downloads before the page can respond: every script, gzipped as CloudFront
// serves it.
const JS_GZIP_BUDGET = 150 * 1024;
// The prerendered page, uncompressed: it carries every scene's markup.
const HTML_BUDGET = 60 * 1024;

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const scripts = (await readdir(new URL("assets/", dist))).filter((name) => name.endsWith(".js"));
let jsGzip = 0;
for (const name of scripts) {
  jsGzip += gzipSync(await readFile(new URL(`assets/${name}`, dist))).length;
}
const html = (await readFile(new URL("index.html", dist))).length;

const checks = [
  {
    label: `JavaScript in dist/assets/ (${scripts.length} files, gzipped)`,
    size: jsGzip,
    budget: JS_GZIP_BUDGET,
  },
  { label: "dist/index.html", size: html, budget: HTML_BUDGET },
];

for (const { label, size, budget } of checks) {
  console.log(`${label}: ${kb(size)} (budget ${kb(budget)})`);
  // Nothing at all means the build wrote nothing there, which would pass any budget.
  if (size === 0) {
    console.error(`${label} is empty`);
    process.exitCode = 1;
  } else if (size > budget) {
    console.error(`${label} is ${kb(size)}, over its budget of ${kb(budget)}`);
    process.exitCode = 1;
  }
}
