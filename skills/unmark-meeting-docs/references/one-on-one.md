# Write a 1:1 document

A 1:1 document is one running file for two people who meet often, such as a manager and a report. It keeps their open action items at the top and one dated entry for each meeting, newest first. See [`../assets/one-on-one.md`](../assets/one-on-one.md) for a complete 1:1 document.

## Shape of the file

1. Front matter with `people` (the two names, with a comma) and `cadence` (how often they meet, with the day, the time, and the time zone, if the sources give them).
2. A `#` title with the two names, such as `# Ana and Tomás: 1:1`.
3. `Links:` and a bullet list of standing links, such as a growth plan or a team board. With no links, leave the list out.
4. `## Open action items`: every action item from every entry that is still open, and every item ticked since.
5. The entries, newest first.

## An entry

```markdown
## 2026-11-20

### Ana's topics

- The new on-call rota starts on 2026-12-01.

### Tomás's topics

- The refunds shutdown notice is ready for review.

### Feedback

- **Ana** said the shutdown plan was clear and on time.

### Growth

- **Tomás** wants to lead the design review in January.

### Action items

- [ ] **Ana**: Add **Tomás** to the January design review. Due 2026-12-04.
```

- Write the heading as `## YYYY-MM-DD`, with the date of the meeting.
- Write a `### <Name>'s topics` section for each person, in the order of the front matter.
- Write `### Feedback`, `### Growth`, and `### Action items` in every entry. With nothing to say, write "Nothing this time."
- Write feedback as what the person said, with who said it. Do not judge or soften it.

## Open action items

- Carry the open items from entry to entry in `## Open action items`. Tick an item when it is done. Never delete an item.
- Tick an item only when a source says it is done.
- Each entry's `### Action items` records what the pair agreed that day. The list at the top is the one to tick.

## Add an entry

1. Add a new `## YYYY-MM-DD` section above the newest entry, below `## Open action items`.
2. Write the topics of each person, the feedback, the growth notes, and the new action items.
3. In `## Open action items`, tick each item that is done and add the new action items.
4. Leave the old entries as they are.

## Personal information

A 1:1 document can hold personal information, such as feedback, health, or pay.

- Do not copy content from the file into other files, commit messages, or pull requests.
- Ask the user before you commit the file to a shared repository.
- Write a commit message that names only the file and the date, such as "Add the 2026-11-20 entry."

## Checks

- [ ] The front matter names the two people and how often they meet.
- [ ] `## Open action items` comes before the first entry and has every item, ticked or not.
- [ ] The entries are newest first, and the old entries are unchanged.
- [ ] Each entry has a topics section for each person, then Feedback, Growth, and Action items.
- [ ] No content from the file is in another file, a commit message, or a pull request.
