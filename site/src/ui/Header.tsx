import { AppIconTile } from "./AppIconTile.tsx";
import { Button } from "./Button.tsx";
import styles from "./Header.module.css";

// In normal flow above the hero, in the hero's navy, so it reads as the hero's top edge and scrolls
// away with it.
export function Header() {
  return (
    <header className={styles.header} data-block="navy">
      <a className={styles.brand} href="/">
        <AppIconTile size={40} />
        <span className={styles.wordmark}>unmark</span>
      </a>
      <nav className={styles.links}>
        <a className={styles.link} href="https://github.com/mlg87/unmark">
          GitHub
        </a>
        <Button variant="primary" size="small" href={__RELEASE__.dmgUrl}>
          Download
        </Button>
      </nav>
    </header>
  );
}
