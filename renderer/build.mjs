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
  entryPoints: { unmark: "src/index.ts" },
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
