// The scroll arithmetic every scene shares, kept free of React and the DOM so it is unit-tested
// directly and no scene issue has to edit it (#183).

export type MotionMode = "pinned" | "static";

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

// Pinned scenes need room to scroll through, and they move a lot, so narrow windows and owners who
// asked for less motion get ordinary stacked blocks.
export function motionMode({ wide, reduce }: { wide: boolean; reduce: boolean }): MotionMode {
  return wide && !reduce ? "pinned" : "static";
}

// One screen while the sheet slides in, `length` screens of its own, one screen while the next
// sheet covers it.
export function sceneHeightSvh(length: number): number {
  return (length + 2) * 100;
}

// `p` runs 0 to 1 over the whole time the sheet is stuck: its own `length` screens, then the
// screen during which the next sheet covers it.
export function splitProgress(p: number, length: number): { progress: number; exit: number } {
  const screens = p * (length + 1);
  return { progress: clamp(screens / length), exit: clamp(screens - length) };
}

// Spreads one 0-to-1 value across `count` items whose windows overlap by `overlap` of their width.
export function stagger(t: number, index: number, count: number, overlap = 0.5): number {
  const width = 1 / (count - (count - 1) * overlap);
  const start = index * width * (1 - overlap);
  return clamp((t - start) / width);
}

export function typed(text: string, t: number): string {
  return text.slice(0, Math.round(text.length * clamp(t)));
}
