import { describe, expect, test } from "vitest";
import { motionMode, sceneHeightSvh, splitProgress, stagger, typed } from "../src/scene/math.ts";

describe("motionMode", () => {
  test.each([
    { wide: true, reduce: false, mode: "pinned" },
    { wide: true, reduce: true, mode: "static" },
    { wide: false, reduce: false, mode: "static" },
    { wide: false, reduce: true, mode: "static" },
  ])("wide $wide, reduce $reduce is $mode", ({ wide, reduce, mode }) => {
    expect(motionMode({ wide, reduce })).toBe(mode);
  });
});

test("sceneHeightSvh adds a screen to enter and a screen to be covered", () => {
  expect(sceneHeightSvh(1)).toBe(300);
  expect(sceneHeightSvh(1.5)).toBe(350);
});

describe("splitProgress for a scene one screen long", () => {
  test("starts with nothing done", () => {
    expect(splitProgress(0, 1)).toEqual({ progress: 0, exit: 0 });
  });

  test("finishes the scene's own screen before the cover screen starts", () => {
    expect(splitProgress(0.5, 1)).toEqual({ progress: 1, exit: 0 });
  });

  test("finishes the exit at the end of the cover screen", () => {
    expect(splitProgress(0.75, 1)).toEqual({ progress: 1, exit: 0.5 });
    expect(splitProgress(1, 1)).toEqual({ progress: 1, exit: 1 });
  });
});

describe("stagger across 5 items", () => {
  test("item 0 starts at t = 0", () => {
    expect(stagger(0, 0, 5)).toBe(0);
    expect(stagger(0.01, 0, 5)).toBeGreaterThan(0);
  });

  test("item 4 ends at t = 1", () => {
    expect(stagger(0.99, 4, 5)).toBeLessThan(1);
    expect(stagger(1, 4, 5)).toBe(1);
  });

  test("item 2 is halfway when t is 0.5", () => {
    expect(stagger(0.5, 2, 5)).toBeCloseTo(0.5);
  });
});

describe("typed", () => {
  test.each([
    [0, ""],
    [0.5, "unm"],
    [1, "unmark"],
    [-1, ""],
    [2, "unmark"],
  ])("at t = %d shows %j", (t, shown) => {
    expect(typed("unmark", t)).toBe(shown);
  });
});
