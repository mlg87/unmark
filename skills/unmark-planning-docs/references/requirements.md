# Requirements

A requirements document says what a product or a project must do, and why. Other names for it are a product requirements document (PRD) and a spec. The people who decide approve it. The people who build read it to learn what "done" means.

## File

Use the file name and the folder of the repository's requirements. If the repository has none, write `docs/requirements/<name-in-kebab-case>.md`, for example `docs/requirements/bank-statement-import.md`.

## Front matter

| Key | Value |
| --- | --- |
| `status` | `Draft`, `In review`, or `Approved` |
| `owner` | The person who keeps the document current |
| `updated` | The date of the last change to the text, as `YYYY-MM-DD` |

The status is `Approved` only when the user says that the people who decide approved it. A new document is `Draft`.

## Sections

Write these sections in this order. Each is a `##` heading under the one `#` title. The title names the feature or the project, not the document type.

1. **Summary.** At most 3 sentences: the problem, the proposal, and the expected result.
2. **Problem.** The evidence for the problem and who has it. Evidence is a number, a quote, a support count, or a research result that the sources give. With no evidence in the sources, write `TBD`.
3. **Goals and non-goals.** Two lists. A goal is a result, not a feature. A non-goal is a thing that a reader can expect but the work will not do.
4. **Users and use cases.** One bullet for each use case, in the form "As a …, I want …, so that …".
5. **Requirements.** The requirements table. See [The requirements table](#the-requirements-table).
6. **Success metrics.** The metrics table. See [The metrics table](#the-metrics-table).
7. **Flow.** A Mermaid `flowchart` of what the user does, when the flow has 3 or more steps. Leave out the section for a flow of fewer steps.
8. **Dependencies.** A bullet list. Each bullet names the thing the work needs, who owns it, and when it is needed.
9. **Risks.** A table with the columns `Risk`, `Likelihood`, `Impact`, and `Response`. Likelihood and impact are `Low`, `Medium`, or `High`.
10. **Open questions.** A task list. Each item is one question with one owner. When a question gets its answer, check the item and write the answer after it.
11. **Rollout.** A numbered list of stages. Each stage says who gets the feature and the condition to go to the next stage.

## The requirements table

The table has the columns `ID`, `Requirement`, `Priority`, and `How to check`.

| ID | Requirement | Priority | How to check |
| --- | --- | --- | --- |
| R1 | The export must include every invoice of the selected month. | Must | Export March. The file has the same count of invoices as the March report. |
| R2 | The export must finish in 30 seconds or less for 10,000 invoices. | Should | Export a month with 10,000 invoices. Time it. |

- **ID.** `R1`, `R2`, and so on. A new requirement gets the highest ID plus 1. Never reuse an ID, also not the ID of a removed requirement.
- **Requirement.** One sentence with "must" that a test can check. Give one requirement in a row.
- **Priority.** `Must`, `Should`, or `Could`. A `Must` blocks the release. A `Should` is planned but does not block it. A `Could` is done only if time remains.
- **How to check.** The action and the result that a tester sees.

A requirement says what, not how. Leave the design to the people who build.

| How (do not write) | What (write) |
| --- | --- |
| Store the export in an S3 bucket with a 7-day lifecycle rule. | The user must be able to download an export for 7 days after it is made. |
| Add a spinner to the Export button. | The page must show that an export is in progress until it finishes. |

A number in a requirement, such as "30 seconds", comes from the sources. If the requirement needs a number that the sources do not give, write `TBD` in its place.

## The metrics table

The table has the columns `Metric`, `Now`, `Target`, and `How measured`.

- **Metric.** One thing that a person can count or time.
- **Now.** The value today, from the sources. If no one measured it, write `TBD`.
- **Target.** The value that shows success, from the sources. Never choose a target yourself. Write `TBD`.
- **How measured.** The tool, the report, or the method that gives the value.

## Check

- [ ] The summary has at most 3 sentences.
- [ ] Each requirement is one testable sentence with "must", and says what, not how.
- [ ] The IDs run `R1`, `R2`, and so on, and no ID is reused.
- [ ] Each priority is `Must`, `Should`, or `Could`.
- [ ] Each number in a requirement, a metric, or a risk comes from the sources.
- [ ] Each open question and each dependency has one owner, a person.
- [ ] A flow of 3 or more steps is a Mermaid diagram.
