import styles from "./Footer.module.css";

const LINKS = [
  { label: "GitHub", href: "https://github.com/mlg87/unmark" },
  { label: "Release notes", href: "https://github.com/mlg87/unmark/releases" },
  { label: "License", href: "https://github.com/mlg87/unmark/blob/main/LICENSE" },
];

export function Footer() {
  return (
    <footer className={styles.footer} data-block="navy">
      <div className={styles.inner}>
        <span className={styles.wordmark}>unmark</span>
        <nav className={styles.links}>
          {LINKS.map(({ label, href }) => (
            <a key={href} className={styles.link} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <p className={styles.legal}>
          Free and open source under the MIT license. © 2026 Mason Goetz.
        </p>
      </div>
    </footer>
  );
}
