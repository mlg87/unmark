import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Install.module.css";

export function Install() {
  return (
    <div className={styles.install}>
      <UnmarkHeading level={2}>Get Unmark.</UnmarkHeading>
    </div>
  );
}
