---
name: unmark-planning-docs
description: Writes planning documents in GitHub-flavored markdown. Covers product and project requirements (PRDs), architecture decision records (ADRs), and project plans with milestones, owners, risks, and a timeline. Use when asked to write requirements, a PRD, a spec, an ADR or decision record, a project plan, a roadmap, or a rollout plan.
license: MIT
---

# Write planning documents

This skill writes one of three planning documents: requirements, a decision record, or a project plan. Each document has a fixed shape. A reader then finds the decision, the owner, and the date without reading everything.

## Steps

1. Pick the document: requirements, a decision record, or a project plan. Read only that reference file:

   | The user asks for | Document | Reference file |
   | --- | --- | --- |
   | Requirements, a PRD, or a spec | Requirements | [`references/requirements.md`](references/requirements.md) |
   | An ADR or a decision record | Decision record | [`references/adr.md`](references/adr.md) |
   | A project plan, a roadmap, or a rollout plan | Project plan | [`references/project-plan.md`](references/project-plan.md) |

2. Look for documents of the same kind in the repository: `docs/adr/`, `docs/decisions/`, `adr/`, `docs/prd/`, `docs/requirements/`, and `docs/plans/`. Read the two newest. The newest have the highest numbers. Without numbers, they are the two that `git log` shows changed last. Copy their file names, their numbering, their front matter, and their section names. The repository's convention wins over the file in `assets/`.
3. Collect the facts from the conversation, the code, and the files. Add no date, owner, estimate, metric, or alternative that the sources do not give. Write `TBD` for a needed fact that is missing, and list every `TBD` in the reply.
4. Write the document. Take its shape from the reference file, or from the repository's documents when step 2 found some. Choose each element with [`references/syntax.md`](references/syntax.md). Write the sentences with the rules in [`references/plain-language.md`](references/plain-language.md).
5. Do "Show the result".

## Rules for all three

- Write every date as `YYYY-MM-DD`.
- Give each item one owner: a person, not a team. An item is a milestone, a task, a risk, a dependency, or an open question. If the sources name only a team, write `TBD` for the person.
- Start the document with YAML front matter that holds `status`, `owner`, and `updated`. The reference file gives the values of `status`. `owner` is the person who keeps the document current. `updated` is the date of the last change to the text.
- Write only what the sources state. A plausible date, name, or number is still a new fact. Leave it out and write `TBD`.
- Keep a needed section when its facts are missing. Write `TBD` under its heading.

## Show the result

After you save the document, run `command -v unmark`. If the command exists, run `unmark <file>` one time, with the path of each file you wrote. Unmark then shows the rendered document to the user. Do not add `--wait`. If the command does not exist, skip this step and say nothing about it.

## References

- [`references/requirements.md`](references/requirements.md): read it at step 1 for requirements. It gives the sections, the requirements table, and the metrics table.
- [`references/adr.md`](references/adr.md): read it at step 1 for a decision record. It gives the file name, the status values, the sections, and how to supersede a record.
- [`references/project-plan.md`](references/project-plan.md): read it at step 1 for a project plan. It gives the sections, the milestones table, and how to draw the timeline from it.
- [`references/syntax.md`](references/syntax.md): read it at step 4. It maps each kind of content to a markdown element, and gives the syntax and limits of each element.
- [`references/plain-language.md`](references/plain-language.md): read it at step 4. It gives the sentence and word rules, with examples.
- [`assets/requirements.md`](assets/requirements.md): a complete requirements document. Read it when the repository has no requirements to copy.
- [`assets/adr.md`](assets/adr.md): a complete decision record. Read it when the repository has no decision records to copy.
- [`assets/project-plan.md`](assets/project-plan.md): a complete project plan. Read it when the repository has no plans to copy.

The three assets describe one invented project, the bank statement import of an invented bookkeeping app called Ledgerly. Their names, dates, and numbers are examples. Never copy them into a document.
