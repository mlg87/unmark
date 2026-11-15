import { UnmarkHeading } from "../ui/UnmarkHeading.tsx";
import styles from "./Appearance.module.css";

export function Appearance() {
  return (
    <div className={styles.appearance}>
      <UnmarkHeading level={2}>Light or dark, like your Mac.</UnmarkHeading>
    </div>
  );
}
