import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Unmark.module.css";

export function Unmark() {
  return (
    <div className={styles.unmark}>
      <UnmarkHeading level={2}>Every mark becomes what it means.</UnmarkHeading>
    </div>
  );
}
