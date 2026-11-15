import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Terminal.module.css";

export function Terminal() {
  return (
    <div className={styles.terminal}>
      <UnmarkHeading level={2}>Open it from the terminal.</UnmarkHeading>
    </div>
  );
}
