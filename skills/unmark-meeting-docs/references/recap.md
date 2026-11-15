# Write a recap

A recap tells each attendee, and each person who missed the meeting, what the meeting decided and who does what by when. Write it from the notes or the transcript that the user gives. See [`../assets/recap.md`](../assets/recap.md) for a complete recap.

## Parts in order

1. `Decisions`
2. `Action items`
3. `Summary`, with one part for each agenda topic
4. `Open questions`
5. `Next meeting`

In a new file, start with front matter (`date`, `time`, `attendees`, `facilitator`, `note_taker`) and a `#` title that names the meeting. Make each part a `##` section, and each topic in the summary a `###` section.

In the agenda's file, add `## Recap` at the end, after the agenda. Make each part a `###` section, and each topic in the summary a `####` section. Change the agenda's front matter only to add a fact the agenda did not have.

## Decisions

```markdown
## Decisions

1. Turn off the v1 refunds API on 2027-01-15.
2. Send the shutdown notice to the 4 clients this week.
```

- Number the decisions.
- Write each decision as one sentence that someone can act on.
- A decision is a proposal that the meeting agreed to, in words such as "decided", "agreed", or "yes". Silence is not agreement.
- A proposal that nobody agreed to is an open question, not a decision.
- With no decisions, write "No decisions." Do not leave the section out.

## Action items

- Write each item as a task-list item: `- [ ] **Ben**: Send the shutdown notice. Due 2026-11-20.`
- Give an action only to a person who accepted it. A person accepts an action when they say they will do it, or say yes when asked. "Someone should do it" assigns nobody. Its owner is `TBD`.
- Give a due date only when the sources give one. Work out "by Friday" from the meeting's date. With no date, write `Due TBD.`
- With no action items, write "No action items."

## Summary

- Write one part for each agenda topic, in the order of the agenda. Without an agenda, use the topics in the order the meeting took them.
- Write at most 3 sentences for a topic.
- Write what was said, and who said it when that matters. Leave out small talk, greetings, and talk about the meeting itself.

## Open questions

- Write each question that the meeting raised and did not answer, as a bullet.
- Name the person who raised it, and what the meeting agreed to do with it, if anything.
- Do not repeat an action item as an open question. A question that an action item answers stays in the action items only.
- With no open questions, write "No open questions."

## Next meeting

Give the date, the time, and the time zone of the next meeting, if the sources give them. Otherwise, write "TBD".

## Rules for a transcript

- Report only what was said. Add no reason, number, name, or date that the speakers did not give.
- Keep each hedge. "We might move the fraud check" stays "might". It does not become "will" or a plan.
- Use quotation marks only for the exact words of a speaker.
- Use the names as the transcript writes them. Name no one who is not in the transcript.
- Keep the recap short. Aim for about 40 lines for a one-hour meeting, and fewer for a shorter one.

## Example of what to write from a transcript

```text
Meeting: Refunds API v1 shutdown. Thursday 2026-11-19.
Ana: Let's turn off v1 on January 15.
Ben: Agreed.
Chioma: We might keep a read-only v1 for one client.
Ana: I'll check the contract with legal.
Ben: Someone should update the status page.
```

```markdown
## Decisions

1. Turn off the v1 refunds API on 2027-01-15.

## Action items

- [ ] **Ana**: Check the contract with legal. Due TBD.
- [ ] **TBD**: Update the status page. Due TBD.

## Open questions

- **Chioma** said the team might keep a read-only v1 for one client. Nobody decided it.
```

## Checks

- [ ] The parts are in the order Decisions, Action items, Summary, Open questions, Next meeting.
- [ ] Each decision is a proposal that the meeting agreed to.
- [ ] Each action item has one owner who accepted it, or `TBD`, and a due date or `Due TBD.`
- [ ] Each hedge in the sources is still in the recap.
- [ ] Each quotation is the exact words of a speaker.
- [ ] Each topic has at most 3 sentences.
- [ ] The recap names no one that the sources do not name.
