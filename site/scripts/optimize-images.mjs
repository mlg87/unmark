// Writes the responsive image files the site imports into src/assets/generated/ (gitignored), so
// the repo keeps one source image each (#183). Runs before `dev`, `build`, and `test`, and skips
// any output newer than its source so repeat runs are instant.
import { mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const site = fileURLToPath(new URL("../", import.meta.url));
const generated = `${site}src/assets/generated/`;
const SCREENSHOTS = ["preview-light", "preview-dark", "split-light", "split-dark"];
const SCREENSHOT_WIDTHS = [800, 1600];
const ICON_SIZES = [64, 256, 512];

function isFresh(source, output) {
  try {
    return statSync(output).mtimeMs >= statSync(source).mtimeMs;
  } catch {
    return false;
  }
}

async function write(source, output, transform) {
  if (isFresh(source, output)) {
    return;
  }
  await transform(sharp(source)).toFile(output);
  console.log(`optimize-images: wrote ${output.slice(site.length)}`);
}

mkdirSync(generated, { recursive: true });
const jobs = [];

for (const name of SCREENSHOTS) {
  const source = `${site}src/assets/app/${name}.png`;
  for (const width of SCREENSHOT_WIDTHS) {
    const out = `${generated}${name}-${width}`;
    jobs.push(write(source, `${out}.avif`, (image) => image.resize({ width }).avif()));
    jobs.push(write(source, `${out}.webp`, (image) => image.resize({ width }).webp()));
  }
  jobs.push(
    write(source, `${generated}${name}-1600.png`, (image) =>
      image.resize({ width: 1600 }).png({ compressionLevel: 9 }),
    ),
  );
}

const icon = `${site}../Artwork/AppIcon.png`;
for (const size of ICON_SIZES) {
  const out = `${generated}app-icon-${size}`;
  jobs.push(write(icon, `${out}.png`, (image) => image.resize(size).png({ compressionLevel: 9 })));
  jobs.push(write(icon, `${out}.webp`, (image) => image.resize(size).webp()));
}

await Promise.all(jobs);
