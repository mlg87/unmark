import { type FunctionComponent, useEffect } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { PAGES, type Page } from "./pages.ts";

const container = document.getElementById("app");
if (!container) {
  throw new Error("index.html has no #app element");
}

// Pinned mode hides scene visuals until this attribute appears, because they are drawn from
// scroll values that only exist once React runs (#183).
function Hydrated({ Component }: { Component: FunctionComponent }) {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "";
  }, []);
  return <Component />;
}

// The dev server serves index.html without prerendered markup, so there is nothing to hydrate.
if (container.childElementCount === 0) {
  createRoot(container).render(<Hydrated Component={App} />);
} else {
  const Component = PAGES[container.dataset.page as Page];
  hydrateRoot(container, <Hydrated Component={Component} />);
}
