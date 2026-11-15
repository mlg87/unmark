// Writes the responsive image files the site imports into src/assets/generated/ (gitignored), so
// the repo keeps one source image each (#183). Runs before `dev`, `build`, and `test`.
import { mkdirSync } from "node:fs";
import { site, writeImage } from "./image-files.mjs";

const generated = `${site}src/assets/generated/`;
const SCREENSHOTS = ["preview-light", "preview-dark", "split-light", "split-dark"];
const SCREENSHOT_WIDTHS = [800, 1600];
const ICON_SIZES = [64, 256, 512];

mkdirSync(generated, { recursive: true });
const jobs = [];

for (const name of SCREENSHOTS) {
  const source = `${site}src/assets/app/${name}.png`;
  for (const width of SCREENSHOT_WIDTHS) {
    const out = `${generated}${name}-${width}`;
    jobs.push(writeImage(source, `${out}.avif`, (image) => image.resize({ width }).avif()));
    jobs.push(writeImage(source, `${out}.webp`, (image) => image.resize({ width }).webp()));
  }
  jobs.push(
    writeImage(source, `${generated}${name}-1600.png`, (image) =>
      image.resize({ width: 1600 }).png({ compressionLevel: 9 }),
    ),
  );
}

const icon = `${site}../Artwork/AppIcon.png`;
for (const size of ICON_SIZES) {
  const out = `${generated}app-icon-${size}`;
  jobs.push(
    writeImage(icon, `${out}.png`, (image) => image.resize(size).png({ compressionLevel: 9 })),
  );
  jobs.push(writeImage(icon, `${out}.webp`, (image) => image.resize(size).webp()));
}

await Promise.all(jobs);
