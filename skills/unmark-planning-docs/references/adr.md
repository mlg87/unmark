# Decision records

A decision record holds one decision, the facts that led to it, and what it changes. Another name for it is an architecture decision record (ADR). Its sections follow Michael Nygard's template: <https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions>.

## File

Use the file names and the numbering of the repository's records. If the repository has none, write `docs/adr/NNNN-title-in-kebab-case.md`.

- `NNNN` is the highest number in the folder plus 1, in four digits. After `0002` comes `0003`. In an empty folder, the first number is `0001`.
- The title in kebab case is the decision statement of the `#` title, for example `0008-cache-sessions-in-redis.md`.

## Front matter

The front matter is the status of the record. Do not write a `## Status` section as well. With the status in one place, a change of status changes one line.

| Key | Value |
| --- | --- |
| `status` | `Proposed`, `Accepted`, `Superseded by NNNN`, or `Deprecated` |
| `owner` | The person who made the decision or who keeps the record |
| `updated` | The date of the decision, as `YYYY-MM-DD` |

- **Proposed.** The decision is not made yet.
- **Accepted.** The decision is made. Write `Accepted` only when the user says that the decision is made, for example "we decided" or "we chose". In all other cases, write `Proposed`.
- **Superseded by NNNN.** A later record, number `NNNN`, replaces this decision.
- **Deprecated.** The decision no longer applies, and no record replaces it.

## Sections

1. `# NNNN. <the decision as a short statement>`. The title is a statement, not a topic: "0008. Cache sessions in Redis", not "0008. Session caching".
2. `## Context`. The facts and the forces, and no decision yet. A force is a need or a limit that pulls toward or away from an option, such as a cost, a deadline, the size of the team, or a requirement. If the decision replaces an earlier record, say so here, with a relative link to that record.
3. `## Decision`. It starts with "We will". Give the one decision in the active voice.
4. `## Alternatives considered`. A table with the columns `Option` and `Why not`. Put in only the alternatives that the sources name. Never add an alternative to make the record look complete. If the sources name an option but no reason, write `TBD` under `Why not`. If the sources name no alternative, write `TBD` under the heading.
5. `## Consequences`. Three `###` sections: "What gets easier", "What gets harder", and "What we must do now". Write a consequence that the sources state, or one that the decision says by itself, such as "Each web server reads sessions from Redis." Give no number, cost, or date that the sources do not give. Write what must be done now as a task list, with one owner for each task.

## Rules

- Put one decision in one record. If the user gives two decisions, write two records.
- Never rewrite an accepted record. To change an accepted decision, write a new record.
- When a new record replaces an older one, change only the status line of the older record: `status: Superseded by NNNN`, where `NNNN` is the number of the new record. Change no other line, not `updated` and not the text.
- To find the record that a new decision replaces, read the titles of all records in the folder, not only the two newest.
- Do not change a record that the new decision does not replace.

## Check

- [ ] The number is the highest number plus 1, in four digits.
- [ ] The `#` title states the decision.
- [ ] The status is `Accepted` only if the user said that the decision is made.
- [ ] The context holds facts and forces, and no decision.
- [ ] The decision starts with "We will".
- [ ] Each alternative comes from the sources.
- [ ] Each number in the record comes from the sources.
- [ ] `git diff` of a superseded record shows one changed line, the status.
