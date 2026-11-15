# Skills check in Claude Code

This check proves that each of the five skills in [`skills/`](../skills) loads for the requests it is for, and for no others (#235). An agent picks a skill from its `description` alone, so five descriptions about markdown documents can compete.

| Fact | Value |
| --- | --- |
| Date | 2026-11-15 |
| Claude Code | 2.1.220 |
| Model | `claude-opus-5[1m]` |
| Skills | `skills/` at commit `3962267` |
| Description changes | None. All 12 rows passed in the first round. |

## Results

| # | Prompt | Expected skill | Loaded skill | Result |
| --- | --- | --- | --- | --- |
| 1 | Write a README for this project. | `unmark-docs` | `unmark-docs` | pass |
| 2 | Write a how-to guide for rotating our API signing key. Put it in docs/rotate-key.md. | `unmark-docs` | `unmark-docs` | pass |
| 3 | Spruce up NOTES.md. | `unmark-polish` | `unmark-polish` | pass |
| 4 | NOTES.md is a wall of text. Make it easier to read. | `unmark-polish` | `unmark-polish` | pass |
| 5 | Document the API in openapi.yaml. | `unmark-api-docs` | `unmark-api-docs` | pass |
| 6 | Write reference docs for the GraphQL schema in schema.graphql. | `unmark-api-docs` | `unmark-api-docs` | pass |
| 7 | Write an agenda for a 30-minute checkout latency review on 2026-11-19 with Priya, Sam, and Lee. | `unmark-meeting-docs` | `unmark-meeting-docs` | pass |
| 8 | Write a recap of the meeting in transcript.txt. | `unmark-meeting-docs` | `unmark-meeting-docs` | pass |
| 9 | Write an ADR. We decided to replace Postgres with SQLite because the app is now single-user. | `unmark-planning-docs` | `unmark-planning-docs` | pass |
| 10 | Draft a PRD for adding CSV export to the invoices page. | `unmark-planning-docs` | `unmark-planning-docs` | pass |
| 11 | Rename the variable in hello.sh to greeting. | none | none | pass |
| 12 | What does hello.sh do? | none | none | pass |

A skill counts as loaded when the session calls the `Skill` tool with its name, or reads its whole `SKILL.md`.

> [!NOTE]
> In row 1, the agent called `Skill` for `unmark-docs` only. It then read the first 6 lines of the other four `SKILL.md` files, because the scratch project holds nothing but the skills and the files below, and its README had to describe them. A read of the frontmatter as project content does not load a skill, so row 1 passes.

[`fixtures/skills/`](fixtures/skills) holds three documents from this run:

| File | What it is |
| --- | --- |
| `polish-before.md` | `NOTES.md` before row 3 |
| `polish-after.md` | `NOTES.md` after row 3 |
| `recap.md` | The file row 8 wrote, `2026-11-12-checkout-latency-review.md` |

`polish-after.md` keeps every fact of `polish-before.md`. The table holds "1 replica" and "6 replicas" as its `Replicas` row, with 1 for staging and 6 for prod.

## Skills in the session

`claude -p --setting-sources project "List the names of the skills you can load."` keeps the maintainer's personal skills out of the session. It does not keep out the skills that ship with Claude Code. The session's `init` event listed these besides the five:

`batch`, `claude-api`, `code-review`, `dataviz`, `debug`, `deep-research`, `design-sync`, `doctor`, `fewer-permission-prompts`, `loop`, `run`, `run-skill-generator`, `schedule`, `simplify`, `update-config`, `verify`

None of them writes markdown documents, and no row loaded one.

## Run the check again

1. Make a scratch git repository with these files, and commit them:

   | File | Content |
   | --- | --- |
   | `.claude/skills/<name>/` | A copy of each folder in `skills/` |
   | `hello.sh` | A 3-line script that prints a greeting |
   | `openapi.yaml` | The `openapi.yaml` of #232 |
   | `transcript.txt` | The `transcript.txt` of #233 |
   | `schema.graphql` | One type, one query, and one mutation |
   | `NOTES.md` | [`fixtures/skills/polish-before.md`](fixtures/skills/polish-before.md) |

2. Run each prompt of the table in a new clone of that repository, so that no row sees another row's edits. `$n` is the row number:

   ```sh
   git clone -q "$SCRATCH" "row-$n"
   cd "row-$n"
   claude -p --setting-sources project --permission-mode acceptEdits \
     --output-format stream-json --verbose "$PROMPT" > "../row-$n.jsonl"
   ```

3. List the skills each row loaded:

   ```sh
   jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") |
     if .name == "Skill" then .input.skill
     elif .name == "Read" and .input.limit == null
       and (.input.file_path // "" | test("\\.claude/skills/[^/]+/SKILL\\.md$"))
     then .input.file_path | capture("skills/(?<s>[^/]+)/SKILL").s
     else empty end' "row-$n.jsonl" | sort -u
   ```

   The `init` event of the same file gives the Claude Code version and the model: `jq -r 'select(.subtype == "init") | .claude_code_version, .model' row-1.jsonl`.

4. If a row fails, change only the `description` lines of the skills' frontmatter, at most 1024 characters each, and run all 12 rows again.
