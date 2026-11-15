import type { ReactNode } from "react";

type AlertKind = "note" | "important" | "warning";

// github.com's 16px octicons and titles for the alert kinds the site shows
// (renderer/src/alerts.css).
const ALERTS: Record<AlertKind, { title: string; octicon: string; path: string }> = {
  note: {
    title: "Note",
    octicon: "octicon-info",
    path: "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
  },
  important: {
    title: "Important",
    octicon: "octicon-report",
    path: "M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  },
  warning: {
    title: "Warning",
    octicon: "octicon-alert",
    path: "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  },
};

// github.com's alert markup, for panels inside a MarkdownBody.
export function Alert({ kind, children }: { kind: AlertKind; children: string }) {
  const { title, octicon, path } = ALERTS[kind];
  return (
    <div className={`markdown-alert markdown-alert-${kind}`}>
      <p className="markdown-alert-title">
        <svg
          className={`octicon ${octicon} mr-2`}
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path d={path} />
        </svg>
        {title}
      </p>
      <p>{children}</p>
    </div>
  );
}

// github.com's task list markup; its checkboxes are disabled outside an editable view. The label
// names each checkbox for screen readers, as the Unmark scene's task list does.
export function TaskItem({ checked, children }: { checked: boolean; children: ReactNode }) {
  return (
    <li className="task-list-item">
      <label>
        <input
          type="checkbox"
          className="task-list-item-checkbox"
          defaultChecked={checked}
          disabled
        />{" "}
        {children}
      </label>
    </li>
  );
}
