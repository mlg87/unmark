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
}

// Lazy everywhere: only the hero's screenshot and mark load eagerly (unmark-2rg.12), and the
// header's 40 px tile still arrives at once, since it is on screen when the page lays out.
export function AppIconTile({ size, alt = "" }: AppIconTileProps) {
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
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
