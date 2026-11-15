import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Split.module.css";

export function Split() {
  return (
    <div className={styles.split}>
      <UnmarkHeading level={2}>Write on the left. Read on the right.</UnmarkHeading>
    </div>
  );
}
