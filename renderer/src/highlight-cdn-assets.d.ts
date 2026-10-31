// @highlightjs/cdn-assets ships no types. Its ES bundle is the same highlight.js build
// with the common languages registered, so highlight.js's own types (a dev dependency
// pinned to the same version) describe it.
declare module "@highlightjs/cdn-assets/es/highlight.min.js" {
  import type { HLJSApi } from "highlight.js";

  const hljs: HLJSApi;
  export default hljs;
}
