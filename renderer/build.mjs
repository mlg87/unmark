// Bundles the renderer into the app's resources (#14). The output is a build
// artifact: App/Resources/Renderer/ is gitignored and rebuilt by `pnpm build`.

import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const outdir = join(packageDir, "../App/Resources/Renderer");
const require = createRequire(import.meta.url);

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await build({
  absWorkingDir: packageDir,
  entryPoints: {
    unmark: "src/index.ts",
    highlight: "src/highlight.css",
    alerts: "src/alerts.css",
    diagrams: "src/diagrams.css",
    "render-error": "src/render-error.css",
  },
  outdir,
  bundle: true,
  // ESM + splitting loads KaTeX (src/math.ts) and Mermaid (src/diagrams.ts) as lazy
  // chunks via import(), which the unmark:// scheme serves from one origin (#22).
  format: "esm",
  splitting: true,
  minify: true,
  // macOS 14 is the deployment target (#11); its WKWebView is Safari 17.
  target: "safari17",
  metafile: true,
  logLevel: "warning",
});

await copyFile(join(packageDir, "index.html"), join(outdir, "index.html"));
await copyFile(
  require.resolve("github-markdown-css/github-markdown.css"),
  join(outdir, "github-markdown.css"),
);

// math.ts links KaTeX's stylesheet, whose @font-face rules load fonts/ by relative URL.
// Only the woff2 files: each rule lists woff2 first, and Safari 17 supports it, so the
// woff and ttf fallbacks are never requested.
const katexDist = dirname(require.resolve("katex/dist/katex.min.css"));
await mkdir(join(outdir, "katex/fonts"), { recursive: true });
await copyFile(join(katexDist, "katex.min.css"), join(outdir, "katex/katex.min.css"));
for (const font of await readdir(join(katexDist, "fonts"))) {
  if (font.endsWith(".woff2")) {
    await copyFile(join(katexDist, "fonts", font), join(outdir, "katex/fonts", font));
  }
}

for (const [file, output] of Object.entries(result.metafile.outputs)) {
  const { size } = await stat(join(packageDir, file));
  console.log(`${output.entryPoint ? "entry" : "chunk"} ${file}  ${(size / 1024).toFixed(1)} KB`);
}

// Per-package caps on what a dependency adds to the entry chunk, which every document
// loads. Read from the metafile, so no baseline build is needed.
const ENTRY_BUDGETS = {
  // #17: the highlight.js common languages must add under 150 KB minified.
  "@highlightjs/cdn-assets": 150 * 1024,
};

const outputs = result.metafile.outputs;
const entry = Object.values(outputs).find((output) => output.entryPoint === "src/index.ts");
const packageBytes = (output, name) =>
  Object.entries(output.inputs)
    .filter(([path]) => path.includes(`node_modules/${name}/`))
    .reduce((sum, [, input]) => sum + input.bytesInOutput, 0);

for (const [name, budget] of Object.entries(ENTRY_BUDGETS)) {
  const bytes = packageBytes(entry, name);
  console.log(
    `${name} adds ${(bytes / 1024).toFixed(1)} KB to the entry (budget ${budget / 1024} KB)`,
  );
  // 0 bytes means the path filter matched nothing, which would pass any budget.
  if (bytes === 0 || bytes >= budget) {
    console.error(`${name}: expected 0 < size < ${budget} bytes in the entry, got ${bytes}`);
    process.exitCode = 1;
  }
}

// Packages that must stay out of what every document loads: the entry and the chunks
// it imports statically.
const LAZY_PACKAGES = [
  // unmark-1793451433078-17-487f189f: KaTeX loads only for math.
  "katex",
  // #19: Mermaid is several MB; diagrams.ts imports it only for diagrams.
  "mermaid",
];

const eagerOutputs = [
  entry,
  ...entry.imports
    .filter((imported) => imported.kind === "import-statement")
    .map((imported) => outputs[imported.path]),
];

for (const name of LAZY_PACKAGES) {
  const eager = eagerOutputs.reduce((sum, output) => sum + packageBytes(output, name), 0);
  const lazy = Object.entries(outputs).filter(
    ([, output]) => !eagerOutputs.includes(output) && packageBytes(output, name) > 0,
  );
  console.log(`${name} is in ${lazy.length} lazy chunk(s)`);
  if (eager > 0 || lazy.length === 0) {
    console.error(`${name}: expected only in lazy chunks, got ${eager} bytes loaded eagerly`);
    process.exitCode = 1;
  }
}
