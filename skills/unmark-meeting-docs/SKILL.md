---
name: unmark-meeting-docs
description: Writes meeting documents in GitHub-flavored markdown. Covers agendas with timed items and owners, recaps with decisions and action items, and running 1:1 documents. Use when asked to prepare an agenda, write meeting notes, minutes, a recap, or a summary of a meeting or a transcript, or to create or update a 1:1 (one-on-one) document.
license: MIT
---

# Write meeting documents

This skill writes three meeting documents. An agenda says what the meeting will decide. A recap says what the meeting decided, and who does what by when. A 1:1 document keeps the record of two people who meet often. Each document has a fixed shape, and it holds only the facts that its sources give.

## Steps

1. Pick the document:

   | Document | When | Reference |
   | --- | --- | --- |
   | Agenda | Before a meeting | [`references/agenda.md`](references/agenda.md) |
   | Recap | After a meeting, from notes or a transcript | [`references/recap.md`](references/recap.md) |
   | 1:1 document | A running file for two people | [`references/one-on-one.md`](references/one-on-one.md) |

   Read only the reference for that document.
2. Collect the facts: the date, the time with its time zone, the people, and the purpose. Add no attendee, decision, owner, or date that the sources do not give. Write `TBD` for a needed fact that is missing, and list every `TBD` in the reply.
3. Write every date as `YYYY-MM-DD`. Work out a relative date, such as "next Friday" or "by Friday", from the meeting's date. If the meeting's date is unknown, write `TBD`.
4. Choose the file:
   - Name a new file `YYYY-MM-DD-<topic>.md`, with the meeting's date and a short topic in lowercase words joined by `-`.
   - Put it in the folder that the user names. With no folder named, put it beside earlier meeting files, or else in the current folder.
   - A recap goes into the agenda's file, under `## Recap`, when that file exists. It then needs no new file.
   - A 1:1 has one file for the pair. Add a new dated section at its top. Make a new file only when the pair has none.
   - Write one file. Make no other file, such as a draft or a copy of the notes.
5. Write the document from its reference and the matching file in `assets/`. Use the elements in [`references/syntax.md`](references/syntax.md) and the sentence rules in [`references/plain-language.md`](references/plain-language.md).
6. Do "Show the result".
7. In the reply, give the path of the file and list every `TBD`.

## Rules for all three

- Put the metadata in YAML front matter, at the top of the file. Unmark and github.com show it as a table.
  - An agenda and a recap use the keys `date`, `time`, `attendees`, `facilitator`, and `note_taker`.
  - A 1:1 document uses the keys `people` and `cadence`.
  - Write each value on one line. Write the names in `attendees` as one line with commas, because a YAML list shows as JSON text.
  - Write `TBD` for a value that the sources do not give.
- Write an action item as a task-list item with one named owner and a due date:

  ```markdown
  - [ ] **Priya**: Send the contract to legal. Due 2026-11-20.
  ```

  - Give each item one owner. Split an action for two people into two items.
  - Start the action with a verb.
  - Write `TBD` for an owner or a due date that the sources do not give: `- [ ] **TBD**: Update the dashboard. Due TBD.`
  - A click on a checkbox in Unmark's Preview ticks it in the file, so the reader can mark an item done.
- Write each name as the source writes it, in bold, such as **Priya**. Never write `@name`, because on GitHub a written `@name` notifies that user. Front matter has no bold, so write names there as plain text.
- Use one `#` title. Do not skip a heading level.
- Name no person that the sources do not name.

## Show the result

After you save the document, run `command -v unmark`. If the command exists, run `unmark <file>` one time, with the path of each file you wrote. Unmark then shows the rendered document to the user. Do not add `--wait`. If the command does not exist, skip this step and say nothing about it.

## References

- [`references/agenda.md`](references/agenda.md): read it at step 1 for an agenda. It gives the parts of an agenda and their limits.
- [`references/recap.md`](references/recap.md): read it at step 1 for a recap. It gives the order of a recap and the rules for a transcript.
- [`references/one-on-one.md`](references/one-on-one.md): read it at step 1 for a 1:1 document. It gives the shape of the file and how to add an entry.
- [`references/syntax.md`](references/syntax.md): read it at step 5. It gives the syntax and limits of each markdown element.
- [`references/plain-language.md`](references/plain-language.md): read it at step 5. It gives the sentence and word rules.
- [`assets/agenda.md`](assets/agenda.md): a complete agenda.
- [`assets/recap.md`](assets/recap.md): a complete recap of the meeting in that agenda.
- [`assets/one-on-one.md`](assets/one-on-one.md): a complete 1:1 document with two entries.
