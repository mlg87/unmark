import { renderToString } from "react-dom/server";
import { PAGES, type Page } from "./pages.ts";

export function render(page: Page): string {
  const Component = PAGES[page];
  return renderToString(<Component />);
}

const SITE_URL = "https://unmarkeditor.com/";

// The tags each page adds to the shared <head>; prerender.mjs writes them into <!--app-head-->.
// Only the home page describes the app to search engines (#192).
export function head(page: Page): string {
  if (page === "not-found") {
    return '<meta name="robots" content="noindex" />';
  }
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Unmark",
    operatingSystem: "macOS 14 or later",
    applicationCategory: "DeveloperApplication",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    softwareVersion: __RELEASE__.version,
    downloadUrl: __RELEASE__.dmgUrl,
    url: SITE_URL,
  };
  // Escaping "<" keeps a "</script>" anywhere in the data from closing the tag early.
  const json = JSON.stringify(app).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}
