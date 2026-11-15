import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./GitHub.module.css";

export function GitHub() {
  return (
    <div className={styles.github}>
      <UnmarkHeading level={2}>Rendered the way GitHub renders it.</UnmarkHeading>
    </div>
  );
}
