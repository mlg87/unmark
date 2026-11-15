import "github-markdown-css/github-markdown-light.css";
import type { ReactNode } from "react";

// GitHub's own stylesheet, as the app's Preview uses, so rendered content on the site looks like it.
export function MarkdownBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ? `markdown-body ${className}` : "markdown-body"}>{children}</div>
  );
}
