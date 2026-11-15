---
name: unmark-docs
description: Writes technical documentation in GitHub-flavored markdown that reads well when rendered. Picks the right element for each kind of content (tables, alerts, Mermaid diagrams, task lists, collapsed sections, math, footnotes) and applies plain-language rules from Simplified Technical English. Use when asked to write or draft a README, guide, how-to, tutorial, runbook, design note, changelog, or any other markdown document, and no more specific documentation skill applies.
license: MIT
---

# Write documentation in markdown

This skill produces one markdown document that answers one question for one reader. The document uses the markdown element that fits each part of its content, and its sentences follow plain-language rules.

## Steps

1. Name the reader and the one question the document answers. Pick its kind: tutorial, how-to guide, reference, or explanation. Do not mix kinds in one document.
2. Collect the facts from the code, the files, and the conversation. Add no fact, number, name, or date that the sources do not give. Write `TBD` where a needed fact is missing, and list every `TBD` in the reply.
3. Outline the headings: one `#` title, then `##` and `###` in order, each worded as what its section answers.
4. Choose an element for each block from the table in [`references/syntax.md`](references/syntax.md).
5. Write the text with the rules in [`references/plain-language.md`](references/plain-language.md): the Strict level for steps, commands, and warnings, the Standard level for explanation.
6. Check the result against the checklist.
7. Save the file, then do "Show the result".

The four kinds come from the Diátaxis framework (<https://diataxis.fr/>):

| Kind | The reader wants to | The document gives |
| --- | --- | --- |
| Tutorial | Learn by doing | One guided path that always works |
| How-to guide | Do one task | The steps for that task, and nothing else |
| Reference | Look up a fact | Complete facts in a fixed order |
| Explanation | Understand why | The reasons, the history, and the tradeoffs |

## Rules

These rules apply to every document.

- Write only what the sources state. An inference or a piece of advice that seems to follow from a fact is a new fact. Leave it out.
- Put the conclusion first: the result, the answer, or the decision comes before the details.
- Use one `#` title.
- Do not skip a heading level. A `###` comes only under a `##`.
- Put a language on every code fence.
- Use a table to compare options on shared attributes. Use at most 5 columns.
- Use a numbered list for a sequence.
- Use at most two alerts. Never put one alert right after another. Use an alert only for a warning that the sources give. With no such warning, use no alert.
- Put bulk of more than 10 lines that most readers skip in `<details>`.
- Use relative links to files inside the same repository.
- Use bold for key terms only.
- Use no emoji in technical text.
- Write GitHub-flavored markdown unless the user names another target. For another target, use only CommonMark and tables.

## Checklist

- [ ] The conclusion comes first.
- [ ] The document has one `#` title.
- [ ] No heading skips a level.
- [ ] Every code fence has a language.
- [ ] Every comparison is a table with at most 5 columns.
- [ ] Every sequence is a numbered list.
- [ ] The document has at most two alerts, no alert follows another, and each alert holds a warning from the sources.
- [ ] Bulk of more than 10 lines that most readers skip is in `<details>`.
- [ ] Links to files in the repository are relative.
- [ ] Bold marks key terms only.
- [ ] The text has no emoji.
- [ ] The markdown fits the target: GitHub-flavored, or CommonMark and tables.
- [ ] Every fact has a source. Read each sentence about the subject and name its source. Delete a sentence that has none.
- [ ] Every `TBD` is listed in the reply.

## Show the result

After you save the document, run `command -v unmark`. If the command exists, run `unmark <file>` one time, with the path of each file you wrote. Unmark then shows the rendered document to the user. Do not add `--wait`. If the command does not exist, skip this step and say nothing about it.

## References

- [`references/syntax.md`](references/syntax.md): read it at step 4. It maps each kind of content to an element, and gives the syntax and limits of each element.
- [`references/plain-language.md`](references/plain-language.md): read it at step 5. It gives the sentence and word rules, with examples.
- [`assets/example.md`](assets/example.md): read it when you want to see a complete how-to guide that follows every rule.
