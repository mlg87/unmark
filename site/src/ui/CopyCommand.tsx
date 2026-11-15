import { useEffect, useRef, useState } from "react";
import styles from "./CopyCommand.module.css";

type Status = "idle" | "copied" | "manual";

const LABELS: Record<Status, string> = {
  idle: "Copy",
  copied: "Copied",
  manual: "Press ⌘C",
};

export function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const commandRef = useRef<HTMLElement>(null);
  const resetTimer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copy() {
    window.clearTimeout(resetTimer.current);
    try {
      // Throws a TypeError where the Clipboard API is missing (insecure origins), which lands in
      // the same fallback as a refused write.
      await navigator.clipboard.writeText(command);
      setStatus("copied");
      resetTimer.current = window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      selectCommand();
      setStatus("manual");
    }
  }

  function selectCommand() {
    const element = commandRef.current;
    const selection = window.getSelection();
    if (!element || !selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return (
    <div className={styles.pill}>
      <code ref={commandRef} className={styles.command}>
        {command}
      </code>
      <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
        {LABELS[status]}
      </button>
    </div>
  );
}
