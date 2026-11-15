import styles from "./NotFound.module.css";
import { Scene } from "./scene/Scene.tsx";
import { Button } from "./ui/Button.tsx";
import { Footer } from "./ui/Footer.tsx";
import { UnmarkHeading } from "./ui/UnmarkHeading.tsx";

// A single unpinned navy sheet, a window tall, so the 404 page reads as the same poster as the home
// page; the heading needs a Scene above it for the values it draws its mark from (#191).
export function NotFound() {
  return (
    <>
      <main>
        <Scene id="not-found" block="navy" length={null} index={0}>
          <div className={styles.notFound}>
            <UnmarkHeading level={1}>This page is unmarked.</UnmarkHeading>
            <p className={styles.line}>There's nothing at this address.</p>
            <Button href="/">Back to unmarkeditor.com</Button>
          </div>
        </Scene>
      </main>
      <Footer />
    </>
  );
}
