// Writes the social card and favicons into public/ (gitignored), which Vite copies to the site's
// root, so search results and link previews show Unmark's logo (#192). Runs before `dev` and
// `build`.
import { site, writeImage } from "./image-files.mjs";

const NAVY = "#02163B";
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
// The macOS app icon's corner radius as a share of its width, so the favicons match the Dock icon.
const CORNER_RATIO = 0.2237;

const banner = `${site}src/assets/brand/banner.png`;
const icon = `${site}../Artwork/AppIcon.png`;
const out = `${site}public/`;

function roundedCorners(size) {
  const radius = size * CORNER_RATIO;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`,
  );
}

function favicon(size) {
  return writeImage(icon, `${out}favicon-${size}.png`, (image) =>
    image
      .resize(size)
      .ensureAlpha()
      .composite([{ input: roundedCorners(size), blend: "dest-in" }])
      .png({ compressionLevel: 9 }),
  );
}

await Promise.all([
  // "contain" scales the banner to the card's full width and pads above and below, so the whole
  // logo shows uncropped.
  writeImage(banner, `${out}og.png`, (image) =>
    image
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "contain", background: NAVY })
      .png({ compressionLevel: 9 }),
  ),
  favicon(32),
  favicon(192),
  // Square, because iOS rounds the corners itself.
  writeImage(icon, `${out}apple-touch-icon.png`, (image) =>
    image.resize(180).png({ compressionLevel: 9 }),
  ),
]);
