import png64 from "../assets/generated/app-icon-64.png";
import webp64 from "../assets/generated/app-icon-64.webp";
import png256 from "../assets/generated/app-icon-256.png";
import webp256 from "../assets/generated/app-icon-256.webp";
import png512 from "../assets/generated/app-icon-512.png";
import webp512 from "../assets/generated/app-icon-512.webp";
import styles from "./AppIconTile.module.css";

const PNG = `${png64} 64w, ${png256} 256w, ${png512} 512w`;
const WEBP = `${webp64} 64w, ${webp256} 256w, ${webp512} 512w`;

interface AppIconTileProps {
  size: number;
  // Empty by default: the icon usually sits beside the word "unmark", which already names it.
  alt?: string;
  // For a tile visible on load: fetched eagerly and first. Every other tile loads lazily.
  priority?: boolean;
}

export function AppIconTile({ size, alt = "", priority = false }: AppIconTileProps) {
  const sizes = `${size}px`;
  return (
    <picture>
      <source type="image/webp" srcSet={WEBP} sizes={sizes} />
      <img
        className={styles.icon}
        src={png256}
        srcSet={PNG}
        sizes={sizes}
        width={size}
        height={size}
        alt={alt}
        loading={priority ? undefined : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}
