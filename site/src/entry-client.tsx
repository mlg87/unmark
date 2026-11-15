import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { PAGES, type Page } from "./pages.ts";

const container = document.getElementById("app");
if (!container) {
  throw new Error("index.html has no #app element");
}

// The dev server serves index.html without prerendered markup, so there is nothing to hydrate.
if (container.childElementCount === 0) {
  createRoot(container).render(<App />);
} else {
  const Component = PAGES[container.dataset.page as Page];
  hydrateRoot(container, <Component />);
}
