// Clickable task-list checkboxes (unmark-1793451438253-28-4df62a6e, epic #5 q25): a click asks
// the app to tick or untick the task in the Source. The app edits the text, marking the document
// dirty, and the Preview shows the new state only when that text renders.

import { tasklist } from "@mdit/plugin-tasklist";
import type { MarkdownIt } from "markdown-it";
import { extendAllowlist } from "./sanitize.ts";
import { SOURCE_LINE } from "./source-lines.ts";

const CHECKBOX_CLASS = "task-list-item-checkbox";

export function taskLists(md: MarkdownIt): void {
  // Class names match github.com's task-list markup, which github-markdown-css styles.
  // No <label> wrapper: a click on the item's text would toggle the task.
  md.use(tasklist, {
    disabled: false,
    label: false,
    containerClass: "contains-task-list",
    itemClass: "task-list-item",
    checkboxClass: CHECKBOX_CLASS,
  });
  // The plugin ids each checkbox `task-item-N`, numbered across the document, for a <label for>
  // that `label: false` leaves out. Without them a task list renders the same wherever it is, so
  // an edit above it reuses its rendering (chunks.ts, unmark-1793451427066-4-97884ee7.1).
  md.core.ruler.after("task_list", "task_list_ids", (state) => {
    for (const token of state.tokens) {
      for (const child of token.children ?? []) {
        if (child.type === "checkbox_input") {
          child.attrs = child.attrs?.filter(([name]) => name !== "id") ?? null;
        }
      }
    }
  });
  // github.com adds task-list markup after sanitizing; here it passes through the
  // sanitizer, so it needs these exact additions.
  extendAllowlist({
    elements: { input: ["type", "checked"] },
    classes: {
      ul: ["contains-task-list"],
      ol: ["contains-task-list"],
      li: ["task-list-item"],
      input: [CHECKBOX_CLASS],
    },
  });
}

/**
 * Posts `{ type: "taskToggled", line, checked }` to the app when the reader clicks a task's
 * checkbox, `checked` being the state asked for. The click itself changes nothing on the page.
 */
export function reportTaskToggles(): void {
  document.addEventListener("click", (event) => {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement) || !checkbox.classList.contains(CHECKBOX_CLASS)) {
      return;
    }
    // The page shows the Source's state: the app re-renders once it has edited the text, and a
    // stale or failed edit leaves the checkbox as the text has it.
    event.preventDefault();
    // The list item's block marker (source-lines.ts) names the line its task marker is on. The
    // checkbox carries none of its own, so it can't count as a block in the line map.
    const item = checkbox.closest(`li[${SOURCE_LINE}]`);
    const line = Number.parseInt(item?.getAttribute(SOURCE_LINE) ?? "", 10);
    if (Number.isNaN(line)) return;
    window.webkit?.messageHandlers?.unmark?.postMessage({
      type: "taskToggled",
      line,
      checked: checkbox.checked,
    });
  });
}
