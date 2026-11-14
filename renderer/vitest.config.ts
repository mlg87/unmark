import { configDefaults, defineConfig } from "vitest/config";

// The keystroke-to-preview test times wall clock, so it runs alone after the other files: on
// CI's runner, sharing its cores with progressive-render.test.ts's 35 s slowed its first
// keystrokes by up to 2x the median and failed it with no regression (unmark-t5a).
const TIMED = "test/keystroke-to-preview.test.ts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "renderer",
          include: ["test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, TIMED],
        },
      },
      {
        test: {
          name: "timed",
          include: [TIMED],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
