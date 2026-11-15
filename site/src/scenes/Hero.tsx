import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <div className={styles.hero}>
      <UnmarkHeading level={1}>Markdown, the way GitHub shows it.</UnmarkHeading>
    </div>
  );
}
