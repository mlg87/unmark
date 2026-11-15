import { renderToString } from "react-dom/server";
import { PAGES, type Page } from "./pages.ts";

export function render(page: Page): string {
  const Component = PAGES[page];
  return renderToString(<Component />);
}
