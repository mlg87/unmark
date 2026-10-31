// Bundles the renderer into the app's resources (#14). The output is a build
// artifact: App/Resources/Renderer/ is gitignored and rebuilt by `pnpm build`.

import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const outdir = join(packageDir, "../App/Resources/Renderer");
const require = createRequire(import.meta.url);

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await build({
  absWorkingDir: packageDir,
  entryPoints: { unmark: "src/index.ts", highlight: "src/highlight.css", alerts: "src/alerts.css" },
  outdir,
  bundle: true,
  // ESM + splitting lets later renderers (KaTeX, Mermaid) load as lazy chunks via import().
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

const entry = Object.values(result.metafile.outputs).find(
  (output) => output.entryPoint === "src/index.ts",
);
for (const [name, budget] of Object.entries(ENTRY_BUDGETS)) {
  const bytes = Object.entries(entry.inputs)
    .filter(([path]) => path.includes(`node_modules/${name}/`))
    .reduce((sum, [, input]) => sum + input.bytesInOutput, 0);
  console.log(
    `${name} adds ${(bytes / 1024).toFixed(1)} KB to the entry (budget ${budget / 1024} KB)`,
  );
  // 0 bytes means the path filter matched nothing, which would pass any budget.
  if (bytes === 0 || bytes >= budget) {
    console.error(`${name}: expected 0 < size < ${budget} bytes in the entry, got ${bytes}`);
    process.exitCode = 1;
  }
}
