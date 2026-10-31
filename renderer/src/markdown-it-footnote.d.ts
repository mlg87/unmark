// @types/markdown-it-footnote targets @types/markdown-it 14, whose MarkdownIt type
// conflicts with the types markdown-it 15 ships.
declare module "markdown-it-footnote" {
  import type { MarkdownIt } from "markdown-it";

  export default function footnote(md: MarkdownIt): void;
}
