import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Outline.module.css";

export function Outline() {
  return (
    <div className={styles.outline}>
      <UnmarkHeading level={2}>Jump to any heading.</UnmarkHeading>
    </div>
  );
}
