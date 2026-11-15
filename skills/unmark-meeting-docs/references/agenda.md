# Write an agenda

An agenda tells each attendee, before the meeting, what the meeting will decide or deliver, who leads each item, and what to read first. Write it from the facts the user gives. See [`../assets/agenda.md`](../assets/agenda.md) for a complete agenda.

## Parts in order

1. Front matter with `date`, `time`, `attendees`, `facilitator`, and `note_taker`. Write the time as the start and the end with the time zone, such as `14:00 to 14:45 America/New_York`.
2. A `#` title that names the meeting.
3. The purpose, in one sentence.
4. `## Outcomes`: a numbered list of at most 3 outcomes. Each outcome is a decision or a thing to deliver.
5. `## Items`: a table of the items, in the order of the meeting.
6. `## Before the meeting`: the reading to do before the meeting.

A recap comes later in the same file, under `## Recap`. Do not write a `## Recap` section before the meeting.

## Purpose

Write one sentence that says why the meeting exists. Start with "Decide", "Agree", or another verb that names the result.

## Outcomes

- Write at most 3 outcomes.
- Make each outcome a decision, such as "Decide the shutdown date of the v1 API", or a thing to deliver, such as "A list of the clients that still call v1".
- A topic with no decision and nothing to deliver is not an outcome. Put it in the items with the goal Inform, or leave it for a message.

## Items table

```markdown
| Time | Topic | Owner | Goal |
| --- | --- | --- | --- |
| 15 min | Shutdown date for the v1 API | **Ana** | Decide |
| 10 min | Clients that still call v1 | **Ben** | Discuss |
| 5 min | Review the action items | **Ana** | Inform |
```

- Use the columns `Time`, `Topic`, `Owner`, and `Goal`, in that order.
- Write `Time` as the length of the item in minutes, such as `15 min`.
- Write `Goal` as one of three words:
  - **Inform**: the owner gives facts. The meeting decides nothing.
  - **Discuss**: the meeting collects views. The meeting decides nothing.
  - **Decide**: the meeting ends the item with a decision.
- Put the items with the goal Decide first.
- Give each item one owner, in bold. An item with no owner gets no place in the agenda. If the user gives no owner, write `**TBD**` and list it in the reply.
- Make the last item a 5-minute review of the action items, with the facilitator as its owner.
- Add up the times. The total must be at most the length of the meeting. If the items do not fit, tell the user which items you left out.

## Before the meeting

```markdown
- [Usage report for the v1 API](https://example.com/reports/v1-usage): read it to know which clients still call v1.
```

- Write each piece of reading as a link, then what to read it for.
- Use only links that the user or the sources give. With no reading, write "No reading."

## Checks

- [ ] The purpose is one sentence.
- [ ] There are at most 3 outcomes, and each is a decision or a thing to deliver.
- [ ] Every item has an owner and a goal of Inform, Discuss, or Decide.
- [ ] The items with the goal Decide come first.
- [ ] The last item is a 5-minute review of the action items.
- [ ] The times add up to at most the length of the meeting.
- [ ] Each link to read says what to read it for.
