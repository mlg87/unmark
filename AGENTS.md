# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

> **Architecture in one line:** Issues live in a local Dolt database
> (`.beads/dolt/`); cross-machine sync uses `bd dolt push/pull` (a
> git-compatible protocol), stored under `refs/dolt/data` on your git
> remote — separate from `refs/heads/*` where your code lives.
> `.beads/issues.jsonl` is a passive export, not the wire protocol.
>
> See [SYNC_CONCEPTS.md](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md)
> for the one-screen overview and anti-patterns (don't treat JSONL as the
> source of truth; don't `bd import` during normal operation; don't
> reach for third-party Dolt hosting before trying the default).

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Every Code Change Is Tracked

No code change lands without all three of these. Create whatever is missing
before you edit anything.

1. **A GitHub issue.** If none exists, open one with `gh issue create`.
2. **At least one bead linked to that issue:**
   `bd create "<title>" --external-ref https://github.com/mlg87/unmark/issues/N`
   (add `--parent <epic-id>` for work under an epic), or
   `bd update <id> --external-ref <issue URL>` for an existing bead. Then
   `bd dolt push`.
3. **A git worktree off `origin/main` HEAD:** `git fetch origin`, then
   `git worktree add ../unmark-<slug> -b N-<slug> origin/main`. Make every edit,
   install, test, and commit there. Never edit, switch branches, or stash in the
   primary checkout.

The PR body names the bead ID(s) and contains `Closes #N`, so merging closes
the issue.

## Agent Workflow (Team-maintainer opt-in)

This repository opts in to the **Team-maintainer** Beads profile. Agents run the
whole loop below without asking for approval. A current "do not commit" or
"do not push" instruction from the user still wins.

1. **Claim:** `bd update <id> --claim`, then `bd dolt push`.
2. **Branch:** create the worktree from "Every Code Change Is Tracked" (branch
   `N-<slug>` off `origin/main` HEAD) and push the branch before making changes.
   Never commit to `main`.
3. **Quality gates:** run lint, tests, and build for everything you changed.
4. **Ship:** commit, push, and open a PR to `main` whose body contains
   `Closes #N`. Then queue it: `gh pr merge <pr> --auto --squash`.
5. **Close out after the merge:** `bd close <id>`, `bd dolt push`, then
   `scripts/epic-closeout/epic-closeout.sh` (see "Epics Close Automatically";
   wait for it to finish), then `git worktree remove <path>` and
   `git branch -D <branch>`. If the PR can't merge (failing checks or requested
   changes), fix it. If it's still blocked, leave the bead `in_progress` with the
   PR URL in `--notes` and report why.
6. **Sync beads:** run `bd dolt push` after any other bead change too (new
   follow-up beads, notes, status updates).

## Epics Close Automatically

Never close an epic by hand. `scripts/epic-closeout/epic-closeout.sh` runs on
the maintainer's Mac, never in GitHub Actions, and uses the local Claude Code
login rather than an API key. It runs after every close-out (step 5), and launchd
runs it hourly as a backstop (`epic-closeout.sh install-schedule`, log in
`~/Library/Logs/unmark-epic-closeout.log`).

Each run finds open epics whose children are all closed. For each one, a
headless Claude verifier checks the epic's `## Success Criteria` in a fresh
worktree off `origin/main` HEAD and records evidence for every criterion. If a
criterion needs tools this Mac lacks, such as full Xcode, the verifier uses the
`CI` run for that commit instead.

- **Pass:** the script closes the epic bead and its GitHub issue, with the
  evidence attached.
- **Fail:** the script opens a GitHub issue and a child bead for each unmet
  criterion. The epic stays open, and the gaps show up in `bd ready`. Closing
  the last gap makes the epic eligible again.

So every epic needs a `## Success Criteria` section of checkable bullets. An
epic without one always fails. To preview a run without changing beads or
issues, use `epic-closeout.sh --dry-run`.

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
