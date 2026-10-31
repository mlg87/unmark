# Parse markdown in the web view with markdown-it, not natively with cmark-gfm

Unmark is a native Swift/SwiftUI app, but its markdown is parsed by markdown-it running in the Preview's WKWebView. It is not parsed in Swift by cmark-gfm (GitHub's own parser, also wrapped by Apple's swift-markdown). cmark-gfm has no math extension, so `$a_b$` is turned into emphasis before KaTeX can see it. GitHub alerts, emoji shortcodes, and front matter would also need hand-rolled pre- and post-processing around it. markdown-it has maintained plugins for all of these and is small (~100 KB). We give up byte-identical GitHub parsing in exchange.

## Considered Options

- **Native swift-cmark-gfm**: GitHub-identical core parsing, but math support would be fragile hacks.
- **unified/remark (micromark)**: passes the GFM spec tests, but the bundle is 3–5× larger and parsing is slower on large files.
