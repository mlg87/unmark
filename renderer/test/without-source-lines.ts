/**
 * Every rendered block carries a source-line marker (source-lines.ts). Golden-HTML tests about
 * other markup compare without them; source-lines.test.ts covers the markers themselves.
 */
export function withoutSourceLines(html: string): string {
  return html.replace(/ data-source-line="\d+"/g, "");
}
