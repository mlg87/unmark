import type { FunctionComponent } from "react";
import { App } from "./App.tsx";
import { NotFound } from "./NotFound.tsx";

// Shared by entry-server's render() and entry-client's hydration, keyed by #app's data-page.
export const PAGES = {
  home: App,
  "not-found": NotFound,
} satisfies Record<string, FunctionComponent>;

export type Page = keyof typeof PAGES;
