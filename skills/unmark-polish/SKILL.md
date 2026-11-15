---
name: unmark-polish
description: Improves an existing markdown document without changing what it says. Turns walls of text into headings, lists, tables, alerts, and diagrams, repairs heading levels and broken formatting, and rewrites unclear sentences in plain language. Use when asked to polish, spruce up, clean up, tidy, reformat, restyle, or improve an existing README, doc, or other markdown file.
license: MIT
---

# Improve an existing markdown document

This skill changes the form of one markdown file and keeps its content. The author gets a document that is easier to read and that says exactly what the old one said, so it needs no new fact-check.

## Steps

1. Read the whole file. Name its reader and its kind: tutorial, how-to guide, reference, or explanation. Read the repository's markdownlint configuration, if it has one, and keep to it. Look for `.markdownlint.jsonc`, `.markdownlint.json`, `.markdownlint.yaml`, `.markdownlint-cli2.jsonc`, and a `markdownlint` key in `package.json`. If the configuration ignores the file, keep to the rules in this skill only.
2. List what must stay the same:
   - Every fact, number, name, date, and link target
   - The contents of every code block and code span
   - Front matter
   - Quoted text
   - Legal text
   - HTML comments
   - The strength of every "may", "can", and "should"
3. Pick the level. **Tidy** when the user asks only for formatting or lint fixes. **Restructure** in every other case. Name the level in the reply.
4. Find the problems with "What to look for". If the document already follows the rules, say so and change nothing.
5. Before you rename or remove a heading, search the repository for links to its anchor and update them in the same change.
6. Edit the file in place. If the file is not under version control, show the planned changes first and wait for a yes.
7. Compare the result with the list from step 2. Restore anything that is lost.
8. Reply with the level, the changes grouped by kind in at most 8 lines, and a list titled "Not changed, for the author": possible errors, content that looks out of date, dead links, and sections that could go.
9. Do "Show the result".

## Tidy

Tidy fixes the markup and leaves every sentence and every section as it is. It may change only these:

- Fence languages: add the language of the code to a fence that has none. Use `text` for output or a listing with no language.
- Heading levels: one `#` title, and no skipped level. Change the number of `#` signs only, not the words.
- List markers: one marker for bullets in the whole file, and numbers for a sequence.
- Table alignment: the pipes, the dashes of the delimiter row, and the spaces in cells.
- Blank lines: one blank line around each heading, list, table, fence, and alert.
- Trailing spaces: remove them. A line break made from two trailing spaces becomes a backslash at the end of the line.

## Restructure

Restructure may do all of Tidy, and also these:

- Split a long section, or reorder sections so that the conclusion comes first and the reader meets each step in the order they do it.
- Turn prose into a list, a table, an alert, or a diagram. Pick each element with the table in [`references/syntax.md`](references/syntax.md).
- Rewrite sentences with the rules in [`references/plain-language.md`](references/plain-language.md): the Strict level for steps, commands, and warnings, the Standard level for explanation.
- Choose one name for a thing that has several. Use the name that the code, the command line, or the user interface uses. If none of them names it, use the name the document uses most.
- Turn bold text that acts as a heading into a heading, at the level that fits.

Every sentence in the result restates a sentence of the original. When a rewrite would drop a condition, a hedge, or an example, keep the longer sentence.

## What to look for

| Problem | Fix | Level |
| --- | --- | --- |
| A paragraph of more than 6 sentences | Split it into paragraphs with one topic each, or into a list | Restructure |
| Steps written as prose | A numbered list, one action in each step, with each command in a fence | Restructure |
| A comparison written as prose | A table with one row for each option and one column for each attribute, at most 5 columns | Restructure |
| A flow of 3 or more steps with a branch, described in words | A Mermaid `flowchart`, with the prose kept below it as the text version | Restructure |
| A warning in the middle of a paragraph | An alert after the paragraph that holds the whole warning and every condition in it. At most two alerts in the file, never one right after another | Restructure |
| Bold text used as a heading | A heading at the next level under its parent | Restructure |
| A skipped heading level | The next level down from the parent heading | Tidy |
| More than one `#` title | Keep the first as the title. Move each other one down one level, with its whole section | Tidy |
| A fence with no language | The language of the code, or `text` | Tidy |
| A log or a listing of more than 10 lines | A `<details>` block with a `<summary>` that says what it holds, and a blank line after `</summary>` | Restructure |
| Several names for one thing | One name, used the same way in the whole file | Restructure |
| Stacked hedges, such as "might possibly" | One hedge of the same strength: "might possibly" becomes "might", not "will" | Restructure |
| A bare URL in prose | An autolink in angle brackets, with the same target | Tidy |
| A sales adjective, such as "blazing fast" | Delete the adjective. Keep any number it came with | Restructure |

Find these too, but do not fix them. List them under "Not changed, for the author":

- A statement that looks wrong, such as a version that differs from the one in the code
- Content that looks out of date, such as a date in the past that the text calls the future
- A link to a file that does not exist, or to a heading anchor that does not exist
- A section that repeats another, or that seems to have no reader

## Never

- Add a fact, a number, a name, a date, a cause, or a piece of advice.
- Remove a fact.
- Change a hedge. "May fail" stays "may fail".
- Change code: the contents of a code block or a code span stay byte for byte the same.
- Change a link target, except to repair an anchor you renamed.
- Delete a section. Merge it or move it, but keep all of its content.
- Touch a file that says it is generated, such as one with "generated" or "do not edit" in its first lines.
- Rewrite quotes, legal text, or changelog entries.

## Show the result

After you save the document, run `command -v unmark`. If the command exists, run `unmark <file>` one time, with the path of each file you wrote. Unmark then shows the rendered document to the user. Do not add `--wait`. If the command does not exist, skip this step and say nothing about it.

## References

- [`references/syntax.md`](references/syntax.md): read it before you turn prose into another element. It maps each kind of content to an element, and gives the syntax and limits of each element.
- [`references/plain-language.md`](references/plain-language.md): read it before you rewrite a sentence. It gives the sentence and word rules, the rules that keep the writer's certainty, and the text that you must not rewrite.
- [`assets/before.md`](assets/before.md) and [`assets/after.md`](assets/after.md): read them when you want to see a worked example. `before.md` is the README of an invented command-line tool, with the problems in "What to look for". `after.md` is the same README after Restructure. It holds every URL, code block, code span, and number of `before.md`.
