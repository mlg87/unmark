// @vitest-environment jsdom

// Clickable task-list checkboxes (unmark-1793451438253-28-4df62a6e): a click asks the app to edit
// the Source and leaves the page as it was until the edited text renders.

import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import "../src/index.ts";

const DOCUMENT = [
  "- [ ] a", // 0
  "- [x] b", // 1
  "  - [ ] c", // 2
  "",
  "> 1. [X] d", // 4
].join("\n");

const postMessage = vi.fn();

beforeAll(() => {
  document.body.innerHTML = '<article class="markdown-body"></article>';
  window.webkit = { messageHandlers: { unmark: { postMessage } } };
});

beforeEach(async () => {
  postMessage.mockClear();
  await window.unmark.render(DOCUMENT, { documentBaseURL: "file:///docs/" });
});

function checkboxes(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")];
}

test("each checkbox is enabled", () => {
  expect(checkboxes().map((box) => box.disabled)).toEqual([false, false, false, false]);
});

test("a click posts the line and the state asked for, and leaves the checkbox as it was", () => {
  for (const box of checkboxes()) box.click();

  expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
    { type: "taskToggled", line: 0, checked: true },
    { type: "taskToggled", line: 1, checked: false },
    { type: "taskToggled", line: 2, checked: true },
    { type: "taskToggled", line: 4, checked: false },
  ]);
  expect(checkboxes().map((box) => box.checked)).toEqual([false, true, false, true]);
});

test("a checkbox without a source line posts nothing", async () => {
  await window.unmark.render('<input type="checkbox" class="task-list-item-checkbox">', {
    documentBaseURL: "file:///docs/",
  });
  const [box] = checkboxes();
  box?.click();

  expect(postMessage).not.toHaveBeenCalled();
  expect(box?.checked).toBe(false);
});
