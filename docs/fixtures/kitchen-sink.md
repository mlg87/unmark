---
fixture: kitchen-sink
---

# Kitchen sink

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

A fixture for the Preview (#22): every GFM feature Unmark renders, plus an image next to this
file and a remote badge. Text has **bold**, *italic*, ~~strikethrough~~, `inline code`, a
[relative link](../adr/0001-parse-markdown-in-webview-with-markdown-it.md), an autolink
<https://github.com>, and an emoji shortcode :tada:.[^1]

## Table

| Feature | Status | Notes |
| :--- | :---: | ---: |
| Tables | done | aligned left, center, right |
| Task lists | done | checkboxes are read-only |
| Images | done | relative and remote |

## Task list

- [x] Render a table
- [x] Render a task list
- [ ] Ship v0.1

## Images

Relative to this file:

![Gradient with diagonal stripes](./img/a.png)

## Code

```swift
let base = PreviewURL.documentBaseURL(forDocumentAt: fileURL)
print(base.absoluteString)
```

> [!NOTE]
> Alerts render with GitHub's octicons.

## Math

Inline $a_b + \frac{1}{2}$ next to prices like $5 and $10, then display math:

$$
\sum_{i=1}^n i = \frac{n(n+1)}{2}
$$

```math
\int_0^1 x\,dx
```

TeX KaTeX can't parse shows its error: $\frac{1}{$

## Quotes and lists

> A plain blockquote.

1. Ordered
   - nested bullet
2. Second

---

[^1]: Footnotes collect at the bottom.
