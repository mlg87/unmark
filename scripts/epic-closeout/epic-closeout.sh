#!/usr/bin/env bash
# Epic closeout (#62). bd never closes an epic by itself, and "every child closed" says nothing about
# whether the epic's Success Criteria hold. This runs on the maintainer's machine, not in CI, using
# the local Claude Code login rather than an API key.
#
#   epic-closeout.sh [--dry-run] [--force]
#       For each open epic whose children are all closed, have a Claude verifier judge its Success
#       Criteria in a fresh worktree off origin/main HEAD, then:
#         pass: close the epic bead and its GitHub issue, with the evidence;
#         fail: file a GitHub issue + child bead per unmet criterion. The epic then has open children
#               again, so it leaves eligibility and its gaps show up in `bd ready`.
#       The verifier gets the finished CI run for that commit, so it first waits for CI.
#       --dry-run runs the verifier but only prints the bead and GitHub changes.
#       --force also assesses epics still cooling down after verifier errors.
#   epic-closeout.sh install-schedule | uninstall-schedule
#       Run it hourly via launchd, as a backstop for closes made outside the agent workflow.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The primary checkout, even when invoked from a linked worktree that will later be removed.
repo="$(cd "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
schedule_label="com.github.mlg87.unmark.epic-closeout"
schedule_plist="$HOME/Library/LaunchAgents/$schedule_label.plist"
schedule_log="$HOME/Library/Logs/unmark-epic-closeout.log"
# Consecutive verifier errors per epic (#65); see cooldown_seconds.
state_file="$repo/.git/epic-closeout-state.json"

usage() {
  sed -n '6,16p' "${BASH_SOURCE[0]}" | sed 's/^#//' >&2
  exit 2
}

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$*"
}

eligible_epics() {
  bd epic status --json |
    jq -c '[(. // [])[] | select(.eligible_for_close and .epic.status != "closed") | .epic.id]'
}

# Which toolchains this Mac has, so the verifier skips commands that can only fail here (#65).
# shellcheck disable=SC2016 # The backticks are literal markdown code spans.
host_environment() {
  if xcodebuild -version >/dev/null 2>&1; then
    printf 'Full Xcode is installed (%s), so `make build`, `make test`, and `make lint` can run here.\n' \
      "$(xcodebuild -version | head -n 1)"
  else
    printf '%s\n' \
      "This Mac has no full Xcode, only the Command Line Tools at \`$(xcode-select -p 2>/dev/null || echo none)\`." \
      'These commands fail here, some only after minutes, so do not run them: `xcodebuild` and `make build`;' \
      '`make test` and `swift test` (the `Testing` module ships only with Xcode); `swiftlint`, and so `make lint`.' \
      'Take their evidence from the CI run below. `swift format`, `xcodegen`, and `pnpm` (biome, vitest, the' \
      'renderer build) work here.'
  fi
}

# Waits for the CI run of main at $1 to finish, then saves it to $2: ci-run.json (run, job, and step
# conclusions) and ci-run.log. Fetched once per check and handed to every verifier, which otherwise
# spends a dozen `gh` round trips finding and polling it (#65). Returns non-zero if no run for the
# commit finishes within EPIC_CI_WAIT_MINUTES.
fetch_ci_run() {
  local sha=$1 out=$2 deadline run id status
  deadline=$(($(date +%s) + ${EPIC_CI_WAIT_MINUTES:-45} * 60))
  while :; do
    run="$(gh run list --workflow ci.yml --branch main --event push --commit "$sha" --limit 1 \
      --json databaseId,status --jq '.[0] // empty | "\(.databaseId) \(.status)"')"
    read -r id status <<<"${run:-- none}"
    if [[ $status == completed ]]; then
      break
    fi
    if (($(date +%s) >= deadline)); then
      log "error: CI for main at $sha is $status after ${EPIC_CI_WAIT_MINUTES:-45} min; retrying next run." >&2
      return 1
    fi
    log "Waiting for CI on main at $sha (run: $status)."
    sleep 30
  done
  gh run view "$id" --json databaseId,url,headSha,conclusion,createdAt,updatedAt,jobs --jq '{
    id: .databaseId, url, headSha, conclusion, createdAt, updatedAt,
    jobs: [.jobs[] | {name, conclusion, steps: [.steps[] | {name, conclusion}]}]
  }' | jq . >"$out/ci-run.json" || return 1
  gh run view "$id" --log >"$out/ci-run.log"
}

# Seconds before an epic gets another verifier run after $1 consecutive verifier errors: 4h, doubling
# to a 24h cap. A no-verdict error leaves the epic eligible, so without this the hourly job would
# spend a ~6 min Opus run on it every hour (#65).
cooldown_seconds() {
  local seconds=$((4 * 3600)) i
  for ((i = 1; i < $1 && seconds < 86400; i++)); do
    seconds=$((seconds * 2))
  done
  echo $((seconds < 86400 ? seconds : 86400))
}

# Prints "<consecutive verifier errors> <epoch of the last one>" for epic $1.
error_streak() {
  if [[ -f $state_file ]]; then
    jq -r --arg id "$1" '.[$id] // {errors: 0, last: 0} | "\(.errors) \(.last)"' "$state_file"
  else
    echo "0 0"
  fi
}

# Applies jq filter $1 (with jq options "${@:2}") to the state file. Never called under --dry-run.
update_state() {
  local filter=$1
  shift
  [[ -f $state_file ]] || echo '{}' >"$state_file"
  jq "$@" "$filter" "$state_file" >"$state_file.tmp"
  mv -f "$state_file.tmp" "$state_file"
}

# Writes the verifier's structured verdict for one epic to stdout. Returns non-zero when the verifier
# produced no verdict: that is an infrastructure failure, not a "fail", so nothing gets filed for it.
assess_epic() {
  local epic_id=$1 check_dir=$2 epic children raw
  epic="$(bd show "$epic_id" --json | jq '.[0]')"
  children="$(bd children "$epic_id" --json | jq '[(. // [])[] | {id, title, status, external_ref}]')"

  # Edit/Write are withheld so the verifier can't "fix" the repo into passing. Bash stays, because
  # running the criteria's commands is the point; it is denied the commands that change shared state.
  # `gh api` stays for reads; the method and body flags that make it write (-f/-F/--input imply POST)
  # are denied wherever they appear in the command.
  # --strict-mcp-config drops the user's global MCP servers: slow to start, and tools the check must not have.
  # --setting-sources project and disableAllHooks drop the user's plugins and every SessionStart hook
  # (#65): ~10 s of startup, and the repo's `bd prime` hook would brief the verifier on bead workflow
  # it is forbidden to run.
  # shellcheck disable=SC2016 # The backticks are literal markdown code fences.
  raw="$(
    printf '%s\n\n## Host\n\n%s\n\n## CI run for main HEAD\n\n```json\n%s\n```\n\n## Epic\n\n```json\n%s\n```\n\n## Children\n\n```json\n%s\n```\n' \
      "$(cat "$here/verifier-prompt.md")" "$(host_environment)" "$(cat "$check_dir/.epic-closeout/ci-run.json")" \
      "$epic" "$children" |
      (cd "$check_dir" && claude -p --output-format json \
        --json-schema "$(jq -c . "$here/verdict.schema.json")" \
        --model "${EPIC_VERIFIER_MODEL:-opus}" --max-turns "${EPIC_VERIFIER_MAX_TURNS:-100}" \
        --strict-mcp-config --setting-sources project --settings '{"disableAllHooks": true}' \
        --allowedTools "Bash,Read,Grep,Glob" \
        --disallowedTools "Edit,Write,NotebookEdit,Bash(bd:*),Bash(git push:*),Bash(gh issue:*),Bash(gh pr merge:*),Bash(gh pr close:*),Bash(gh pr comment:*),Bash(gh pr edit:*),Bash(gh workflow:*),Bash(gh run rerun:*),Bash(gh api*-X*),Bash(gh api*--method*),Bash(gh api*-f*),Bash(gh api*-F*),Bash(gh api*--input*)")
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

# shellcheck disable=SC2016 # The update_state filters are jq, whose $variables come from --arg.
cmd_check() {
  dry_run=0
  local force=0 arg
  for arg in "$@"; do
    case $arg in
      --dry-run) dry_run=1 ;;
      --force) force=1 ;;
      *) usage ;;
    esac
  done

  # One run at a time: overlapping runs would double-file gaps and race on `bd dolt push`.
  # Global, not local: the EXIT trap runs after this function's locals are gone.
  lock_dir="$repo/.git/epic-closeout.lock"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    log "Another epic closeout run holds $lock_dir; exiting."
    return 0
  fi
  check_dir="" ci_dir=""
  trap 'if [[ -n $check_dir ]]; then git -C "$repo" worktree remove --force "$check_dir"; fi; if [[ -n $ci_dir ]]; then rm -rf "$ci_dir"; fi; rmdir "$lock_dir"' EXIT

  cd "$repo"
  bd dolt pull
  local eligible epic_ids="" epic_id errors last next sha commit verdict failures=0
  eligible="$(eligible_epics)"
  if ((!dry_run)); then
    # Streaks of epics that closed or regained open children no longer matter.
    update_state 'with_entries(select(.key as $k | any($ids[]; . == $k)))' --argjson ids "$eligible"
  fi
  for epic_id in $(jq -r '.[]' <<<"$eligible"); do
    read -r errors last <<<"$(error_streak "$epic_id")"
    next=$((last + $(cooldown_seconds "$errors")))
    if ((errors > 0 && !force && $(date +%s) < next)); then
      log "Skipping $epic_id until $(date -r "$next" '+%Y-%m-%dT%H:%M:%S'): the verifier errored on its last $errors run(s). --force runs it now."
      continue
    fi
    epic_ids="$epic_ids $epic_id"
  done
  if [[ -z $epic_ids ]]; then
    log "No eligible epics to assess."
    return 0
  fi

  git fetch --quiet origin main
  sha="$(git rev-parse origin/main)"
  ci_dir="$(mktemp -d "${TMPDIR:-/tmp}/unmark-epic-ci.XXXXXX")"
  # No verifier runs without the CI evidence; this isn't any epic's fault, so no streak grows.
  fetch_ci_run "$sha" "$ci_dir" || return 1

  for epic_id in $epic_ids; do
    log "Assessing $epic_id"
    # A fresh worktree per epic, off main HEAD, so one verifier's scratch state can't leak into the next.
    check_dir="$(mktemp -d "${TMPDIR:-/tmp}/unmark-epic-check.XXXXXX")"
    git worktree add --quiet --detach "$check_dir" "$sha"
    cp -Rf "$ci_dir" "$check_dir/.epic-closeout"
    commit="$(git -C "$check_dir" rev-parse --short HEAD)"

    if verdict="$(assess_epic "$epic_id" "$check_dir")"; then
      if ((!dry_run)); then
        update_state 'del(.[$id])' --arg id "$epic_id"
      fi
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
      if ((!dry_run)); then
        update_state '.[$id] = {errors: ((.[$id].errors // 0) + 1), last: $now}' \
          --arg id "$epic_id" --argjson now "$(date +%s)"
      fi
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
