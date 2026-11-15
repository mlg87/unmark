import type { ReactNode } from "react";
import styles from "./Keycap.module.css";

export function Keycap({ children }: { children: ReactNode }) {
  return <kbd className={styles.keycap}>{children}</kbd>;
}
