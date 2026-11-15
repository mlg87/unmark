import styles from "./WindowShot.module.css";

// Written by scripts/optimize-images.mjs from the site's own copies in assets/app/ (#183).
const FILES = import.meta.glob<string>("../assets/generated/*.{avif,webp,png}", {
  eager: true,
  import: "default",
});

const HEIGHTS = {
  "preview-light": 1600,
  "preview-dark": 1600,
  "split-light": 1111,
  "split-dark": 1111,
};

export type Screenshot = keyof typeof HEIGHTS;

function file(name: string): string {
  const url = FILES[`../assets/generated/${name}`];
  if (!url) {
    throw new Error(`No generated image ${name}; run scripts/optimize-images.mjs`);
  }
  return url;
}

function srcSet(shot: Screenshot, format: "avif" | "webp"): string {
  return [800, 1600].map((width) => `${file(`${shot}-${width}.${format}`)} ${width}w`).join(", ");
}

interface WindowShotProps {
  shot: Screenshot;
  alt: string;
  // For a screenshot visible on load: fetched eagerly and first.
  priority?: boolean;
  sizes?: string;
  className?: string;
}

export function WindowShot({
  shot,
  alt,
  priority = false,
  sizes = "(min-width: 1600px) 1600px, 100vw",
  className,
}: WindowShotProps) {
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(shot, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(shot, "webp")} sizes={sizes} />
      <img
        className={className ? `${styles.shot} ${className}` : styles.shot}
        src={file(`${shot}-1600.png`)}
        width={1600}
        height={HEIGHTS[shot]}
        alt={alt}
        loading={priority ? undefined : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}
