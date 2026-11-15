import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "./Button.tsx";
import styles from "./FloatingDownload.module.css";

// Both of these sections already show a download button of their own (#191).
const OWN_DOWNLOAD = ["hero", "install"];

// Keeps a download within reach while the visitor scrolls through the scenes. It starts hidden, so
// the prerendered HTML never has it; the observer's first report shows it if the page loads
// part-way down.
export function FloatingDownload() {
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onScreen.add(entry.target);
        } else {
          onScreen.delete(entry.target);
        }
      }
      setVisible(onScreen.size === 0);
    });
    for (const id of OWN_DOWNLOAD) {
      const section = document.getElementById(id);
      if (section) {
        observer.observe(section);
      }
    }
    return () => observer.disconnect();
  }, []);

  const offset = reduce ? 0 : -20;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.floating}
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offset }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <Button className={styles.button} size="small" href={__RELEASE__.dmgUrl}>
            Download
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
