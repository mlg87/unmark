import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import type { Release } from "./scripts/release.ts";

// A fixed release so tests never touch the network, unlike vite.config.ts (#182).
const release: Release = {
  version: "0.0.0",
  dmgUrl: "https://example.invalid/Unmark-0.0.0.dmg",
};

export default defineConfig({
  plugins: [react()],
  define: { __RELEASE__: JSON.stringify(release) },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
