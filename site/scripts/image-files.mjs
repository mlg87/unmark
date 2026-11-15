// Shared by the prebuild image scripts: each output is rewritten only when its source is newer,
// so repeat runs are instant (#183).
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const site = fileURLToPath(new URL("../", import.meta.url));

function isFresh(source, output) {
  try {
    return statSync(output).mtimeMs >= statSync(source).mtimeMs;
  } catch {
    return false;
  }
}

export async function writeImage(source, output, transform) {
  if (isFresh(source, output)) {
    return;
  }
  await transform(sharp(source)).toFile(output);
  console.log(`wrote site/${output.slice(site.length)}`);
}
