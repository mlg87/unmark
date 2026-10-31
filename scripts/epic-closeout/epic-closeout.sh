#!/usr/bin/env bash
# Epic closeout (#62). bd never closes an epic by itself, and "every child closed" says nothing about
# whether the epic's Success Criteria hold. This runs on the maintainer's machine, not in CI, using
# the local Claude Code login rather than an API key.
#
#   epic-closeout.sh [--dry-run]
#       For each open epic whose children are all closed, have a Claude verifier judge its Success
#       Criteria in a fresh worktree off origin/main HEAD, then:
#         pass: close the epic bead and its GitHub issue, with the evidence;
#         fail: file a GitHub issue + child bead per unmet criterion. The epic then has open children
#               again, so it leaves eligibility and its gaps show up in `bd ready`.
#       --dry-run runs the verifier but only prints the bead and GitHub changes.
#   epic-closeout.sh install-schedule | uninstall-schedule
#       Run it hourly via launchd, as a backstop for closes made outside the agent workflow.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The primary checkout, even when invoked from a linked worktree that will later be removed.
repo="$(cd "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
schedule_label="com.github.mlg87.unmark.epic-closeout"
schedule_plist="$HOME/Library/LaunchAgents/$schedule_label.plist"
schedule_log="$HOME/Library/Logs/unmark-epic-closeout.log"

usage() {
  sed -n '6,15p' "${BASH_SOURCE[0]}" | sed 's/^#//' >&2
  exit 2
}

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$*"
}

eligible_epics() {
  bd epic status --json |
    jq -c '[(. // [])[] | select(.eligible_for_close and .epic.status != "closed") | .epic.id]'
}

# Writes the verifier's structured verdict for one epic to stdout. Returns non-zero when the verifier
# produced no verdict: that is an infrastructure failure, not a "fail", so nothing gets filed for it.
assess_epic() {
  local epic_id=$1 check_dir=$2 epic children raw
  epic="$(bd show "$epic_id" --json | jq '.[0]')"
  children="$(bd children "$epic_id" --json | jq '[(. // [])[] | {id, title, status, external_ref}]')"

  # Edit/Write are withheld so the verifier can't "fix" the repo into passing. Bash stays, because
  # running the criteria's commands is the point; it is denied the commands that change shared state.
  # --strict-mcp-config drops the user's global MCP servers: slow to start, and tools the check must not have.
  # shellcheck disable=SC2016 # The backticks are literal markdown code fences.
  raw="$(
    printf '%s\n\n## Epic\n\n```json\n%s\n```\n\n## Children\n\n```json\n%s\n```\n' \
      "$(cat "$here/verifier-prompt.md")" "$epic" "$children" |
      (cd "$check_dir" && claude -p --output-format json \
        --json-schema "$(jq -c . "$here/verdict.schema.json")" \
        --model "${EPIC_VERIFIER_MODEL:-opus}" --max-turns "${EPIC_VERIFIER_MAX_TURNS:-100}" \
        --strict-mcp-config \
        --allowedTools "Bash,Read,Grep,Glob" \
        --disallowedTools "Edit,Write,NotebookEdit,Bash(bd:*),Bash(git push:*),Bash(gh issue:*),Bash(gh pr merge:*),Bash(gh pr close:*),Bash(gh pr comment:*),Bash(gh pr edit:*),Bash(gh workflow:*),Bash(gh run rerun:*)")
  )" || true

  if jq -e '.is_error == false and (.structured_output | type == "object")' <<<"$raw" >/dev/null 2>&1; then
    jq --arg id "$epic_id" '{epic_id: $id} + .structured_output' <<<"$raw"
  else
    log "error: verifier returned no verdict for $epic_id" >&2
    jq -r '.result // .' <<<"$raw" >&2 2>/dev/null || printf '%s\n' "$raw" >&2
    return 1
  fi
}

render_report() {
  jq -r '
    def cell: gsub("\\|"; "\\|") | gsub("\r?\n"; "<br>");
    "### Epic closeout check: \(if .verdict == "pass" and (.criteria | length > 0) and all(.criteria[]; .met) then "PASS" else "FAIL" end)",
    "",
    "Checked `\(.epic_id)` against `main` at \(.commit).",
    "",
    .summary,
    "",
    "| Criterion | Met | Evidence |",
    "| --- | --- | --- |",
    (.criteria[] | "| \(.criterion | cell) | \(if .met then "✅" else "❌" end) | \(.evidence | cell) |")
  ' <<<"$1"
}

# Prints the command instead of running it under --dry-run.
run() {
  if ((dry_run)); then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

apply_verdict() {
  local verdict=$1 epic_id epic issue priority report gaps gap gap_title gap_body gap_url
  epic_id="$(jq -r .epic_id <<<"$verdict")"
  epic="$(bd show "$epic_id" --json | jq '.[0]')"
  issue="$(jq -r '.external_ref // "" | capture("/issues/(?<n>[0-9]+)$").n // ""' <<<"$epic")"
  priority="$(jq -r '.priority // 2' <<<"$epic")"
  report="$(render_report "$verdict")"

  if jq -e '.verdict == "pass" and (.criteria | length > 0) and all(.criteria[]; .met)' <<<"$verdict" >/dev/null; then
    log "PASS $epic_id"
    run bd close "$epic_id" --reason "Epic closeout check passed against main at $(jq -r .commit <<<"$verdict")."
    run bd comment "$epic_id" "$report"
    if [[ -n $issue ]]; then
      run gh issue close "$issue" --reason completed --comment "$report"
    fi
    return
  fi

  log "FAIL $epic_id"
  # A "fail" with every criterion marked met still needs one actionable gap, built from the summary.
  gaps="$(jq -c '
    [.criteria[] | select(.met | not)] as $unmet
    | if ($unmet | length) > 0 then $unmet[]
      else {criterion: "Resolve the epic closeout check failure", evidence: .summary} end
  ' <<<"$verdict")"

  while IFS= read -r gap; do
    gap_title="$(jq -r '"Close epic gap: " + (.criterion | gsub("\\s+"; " ") | if length > 80 then .[:77] + "..." else . end)' <<<"$gap")"
    gap_body="$(
      jq -r --arg epic "$epic_id" --arg issue "$issue" '
        "The epic closeout check found an unmet Success Criterion on `\($epic)`"
        + (if $issue != "" then " (#\($issue))" else "" end) + ".",
        "", "**Criterion:** \(.criterion)", "", "**Evidence:** \(.evidence)"
      ' <<<"$gap"
    )"
    if ((dry_run)); then
      run gh issue create --title "$gap_title" --body "$gap_body"
      gap_url="https://github.com/mlg87/unmark/issues/NEW"
    else
      gap_url="$(gh issue create --title "$gap_title" --body "$gap_body")"
    fi
    run bd create "$gap_title" --parent "$epic_id" --type task --priority "$priority" \
      --external-ref "$gap_url" --description "$gap_body"
  done <<<"$gaps"

  if [[ -n $issue ]]; then
    run gh issue comment "$issue" --body "$report"
  fi
}

cmd_check() {
  dry_run=0
  case ${1:-} in
    --dry-run) dry_run=1 ;;
    "") ;;
    *) usage ;;
  esac

  # One run at a time: overlapping runs would double-file gaps and race on `bd dolt push`.
  # Global, not local: the EXIT trap runs after this function's locals are gone.
  lock_dir="$repo/.git/epic-closeout.lock"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    log "Another epic closeout run holds $lock_dir; exiting."
    return 0
  fi
  check_dir=""
  trap 'if [[ -n $check_dir ]]; then git -C "$repo" worktree remove --force "$check_dir"; fi; rmdir "$lock_dir"' EXIT

  cd "$repo"
  bd dolt pull
  local epic_ids epic_id commit verdict failures=0
  epic_ids="$(eligible_epics | jq -r '.[]')"
  if [[ -z $epic_ids ]]; then
    log "No eligible epics."
    return 0
  fi

  git fetch --quiet origin main
  for epic_id in $epic_ids; do
    log "Assessing $epic_id"
    # A fresh worktree per epic, off main HEAD, so one verifier's scratch state can't leak into the next.
    check_dir="$(mktemp -d "${TMPDIR:-/tmp}/unmark-epic-check.XXXXXX")"
    git worktree add --quiet --detach "$check_dir" origin/main
    commit="$(git -C "$check_dir" rev-parse --short HEAD)"

    if verdict="$(assess_epic "$epic_id" "$check_dir")"; then
      verdict="$(jq --arg commit "$commit" '. + {commit: $commit}' <<<"$verdict")"
      printf '%s\n' "$verdict"
      # Re-check right before acting: a child may have been reopened or added while the verifier ran.
      bd dolt pull
      if jq -e --arg id "$epic_id" 'index($id) != null' <<<"$(eligible_epics)" >/dev/null; then
        apply_verdict "$verdict"
      else
        log "Skipping $epic_id: no longer an open epic with every child closed."
      fi
    else
      failures=$((failures + 1))
    fi

    git worktree remove --force "$check_dir"
    check_dir=""
  done

  if ((!dry_run)); then
    bd dolt push
  fi
  ((failures == 0))
}

cmd_install_schedule() {
  # launchd runs the copy in the primary checkout, which outlives the worktree this may be run from.
  local script="$repo/scripts/epic-closeout/epic-closeout.sh"
  [[ -x $script ]] || {
    echo "error: $script is missing; sync main in $repo first." >&2
    exit 1
  }
  mkdir -p "$(dirname "$schedule_plist")" "$(dirname "$schedule_log")"
  # launchd starts jobs with a bare PATH; bd, claude, gh, jq, and pnpm all live outside it.
  cat >"$schedule_plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$schedule_label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$script</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$repo</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PATH</string>
  </dict>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>$schedule_log</string>
  <key>StandardErrorPath</key>
  <string>$schedule_log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$schedule_label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$schedule_plist"
  echo "Installed $schedule_label (hourly). Log: $schedule_log"
}

cmd_uninstall_schedule() {
  launchctl bootout "gui/$(id -u)/$schedule_label" 2>/dev/null || true
  rm -f "$schedule_plist"
  echo "Removed $schedule_label."
}

case ${1:-} in
  install-schedule) cmd_install_schedule ;;
  uninstall-schedule) cmd_uninstall_schedule ;;
  -h | --help) usage ;;
  *) cmd_check "$@" ;;
esac
