import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fetchLatestRelease } from "./scripts/release.ts";

// Looked up on every build, and a failed lookup fails it: the site must never ship a dead
// download button (#182).
const release = await fetchLatestRelease();

export default defineConfig({
  plugins: [react()],
  define: { __RELEASE__: JSON.stringify(release) },
});
