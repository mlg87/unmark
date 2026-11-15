// Writes the SSR markup into the client build's HTML, so each page ships real content before
// any script runs (#182).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const template = readFileSync(`${dist}index.html`, "utf8");

for (const placeholder of ["<!--app-head-->", "<!--app-html-->"]) {
  if (!template.includes(placeholder)) {
    console.error(`dist/index.html is missing the ${placeholder} placeholder`);
    process.exit(1);
  }
}

const { render } = await import(new URL("../dist-server/entry-server.js", import.meta.url).href);

function page(name, head) {
  // Function replacers, because a string replacement expands $&, $', $$ and the like found in
  // the markup (#199).
  return template
    .replace("<!--app-head-->", () => head)
    .replace('<div id="app">', `<div id="app" data-page="${name}">`)
    .replace("<!--app-html-->", () => render(name));
}

writeFileSync(`${dist}index.html`, page("home", ""));
writeFileSync(
  `${dist}404.html`,
  page("not-found", '<meta name="robots" content="noindex" />').replace(
    /<title>.*<\/title>/,
    "<title>Page not found · Unmark</title>",
  ),
);
