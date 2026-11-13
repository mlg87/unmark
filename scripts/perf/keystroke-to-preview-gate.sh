#!/usr/bin/env bash
# Holds q47's keystroke-to-preview on the oldest Mac (unmark-1793451427523-5-478d1806.11). CI can't: its runner's
# WebKit medians vary 2x between runs, and the renderer-free workload tried as a yardstick didn't scale between the
# runner and the oldest Mac the way the keystroke does (unmark-1793451427523-5-478d1806.10). So this runs
# keystroke-to-preview.swift on the maintainer's 2019 i9 MacBook Pro, of the oldest generation macOS 14 supports,
# once for every new main.
#
#   keystroke-to-preview-gate.sh [--now] [--dry-run]
#       Times origin/main HEAD in a fresh worktree, unless that commit already has a result. The harness needs its
#       window in front, so this waits until the screen is unlocked and nobody has touched the keyboard or mouse
#       for Q47_GATE_IDLE_SECONDS (default 120), rather than take focus from someone typing; --now doesn't wait.
#         under budget: a success status `q47 keystroke-to-preview` on the commit;
#         over budget twice in a row with the window in front: a failure status on the commit, and a GitHub
#             issue + bead, or a comment on the last issue this filed while it is still open;
#         inconclusive (the window lost focus, the screen locked): nothing; the next run tries again.
#       --dry-run times it but only prints the status, issue, and bead changes.
#   keystroke-to-preview-gate.sh install-schedule | uninstall-schedule
#       Run it every 15 min via launchd, in the login session, the only one that can show the harness's window.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The primary checkout, even when invoked from a linked worktree that will later be removed.
repo="$(cd "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
schedule_label="com.github.mlg87.unmark.keystroke-to-preview-gate"
schedule_plist="$HOME/Library/LaunchAgents/$schedule_label.plist"
schedule_log="$HOME/Library/Logs/unmark-keystroke-to-preview-gate.log"
# The last commit with a result, and the last issue filed for a failure.
state_file="$repo/.git/keystroke-to-preview-gate.json"
# An flock, as epic-closeout.sh's: the kernel releases it when a run dies, even by SIGKILL.
lock_file="$repo/.git/keystroke-to-preview-gate.flock"
status_context="q47 keystroke-to-preview"

usage() {
  sed -n '8,18p' "${BASH_SOURCE[0]}" | sed 's/^#//' >&2
  exit 2
}

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$*"
}

# Every Apple silicon Mac is faster than the oldest generation macOS 14 supports, the 2017-2019 Intel Macs, so a
# pass on one would say nothing about q47.
require_intel() {
  if [[ $(sysctl -n hw.optional.arm64 2>/dev/null || echo 0) == 1 ]]; then
    echo "error: q47 is held on an Intel Mac of the oldest generation macOS 14 supports, not Apple silicon." >&2
    exit 1
  fi
}

state() {
  if [[ -f $state_file ]]; then
    jq -r "$1 // \"\"" "$state_file"
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

idle_seconds() {
  # Reads to the end: exiting early would SIGPIPE ioreg, and pipefail would end the run.
  ioreg -c IOHIDSystem | awk '/HIDIdleTime/ && !found {print int($NF / 1000000000); found = 1}'
}

# Removes check worktrees, including any a killed run left behind. Only ever called under the lock.
clean_up_run() {
  local path
  git -C "$repo" worktree list --porcelain |
    awk '/^worktree / && index($0, "/unmark-q47-check.") {print substr($0, 10)}' |
    while IFS= read -r path; do
      if [[ -d $path ]]; then
        git -C "$repo" worktree remove --force "$path"
      fi
    done
  git -C "$repo" worktree prune
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

# Times the renderer in worktree $1 into $2 and returns the harness's exit status: 0 under budget, 1 over it (or
# broken), 3 inconclusive, 2 not runnable. caffeinate keeps the display awake: a sleeping one paints no frames.
time_keystrokes() {
  local status=0
  caffeinate -d -i swift "$1/scripts/perf/keystroke-to-preview.swift" >"$2" 2>&1 || status=$?
  cat "$2"
  return "$status"
}

median_of() {
  awk '/call to painted:/ {print $NF; exit}' "$1"
}

set_commit_status() {
  run gh api --silent "repos/{owner}/{repo}/statuses/$1" -f state="$2" -f context="$status_context" \
    -f description="$3"
}

# shellcheck disable=SC2016 # The update_state filters are jq, whose $variables come from --arg.
report_failure() {
  local sha=$1 first=$2 second=$3 median issue title body url
  median="$(median_of "$second")"
  if [[ -n $median ]]; then
    title="Renderer: keystroke-to-preview median $median ms on the oldest Mac at main ${sha:0:7}, over q47's 210 ms"
  else
    title="Renderer: keystroke-to-preview.swift fails on the oldest Mac at main ${sha:0:7}"
  fi
  body="$(
    printf '%s\n' \
      "scripts/perf/keystroke-to-preview-gate.sh timed \`main\` at $sha on the oldest Mac twice in a row, with the" \
      "window in front, and both runs failed: a median from \`callAsyncJavaScript\` to the painted frame at or over" \
      "q47's 250 ms less the 40 ms edit debounce, or the harness's error. Find the change that caused it." \
      "" '```text' "$(cat "$first")" '```' "" '```text' "$(cat "$second")" '```'
  )"
  issue="$(state .issue)"
  if [[ -n $issue && $(gh issue view "$issue" --json state --jq .state 2>/dev/null) == OPEN ]]; then
    log "Still over budget; commenting on $issue."
    run gh issue comment "$issue" --body "$title"$'\n\n'"$body"
    return
  fi
  if ((dry_run)); then
    run gh issue create --title "$title" --body "$body"
    url="https://github.com/mlg87/unmark/issues/NEW"
  else
    url="$(gh issue create --title "$title" --body "$body")"
    update_state '.issue = $url' --arg url "$url"
  fi
  log "Filed $url."
  run bd dolt pull
  run bd create "$title" --type bug --priority 2 --external-ref "$url" --description "$body"
  run bd dolt push
}

# shellcheck disable=SC2016 # The update_state filters are jq, whose $variables come from --arg.
cmd_check() {
  dry_run=0
  local now=0 arg
  for arg in "$@"; do
    case $arg in
      --dry-run) dry_run=1 ;;
      --now) now=1 ;;
      *) usage ;;
    esac
  done
  require_intel

  exec 9>>"$lock_file"
  if ! lockf -s -t 0 9; then
    log "Another run holds $lock_file; exiting."
    return 0
  fi
  trap clean_up_run EXIT
  clean_up_run

  cd "$repo"
  git fetch --quiet origin main
  local sha idle_needed=${Q47_GATE_IDLE_SECONDS:-120} idle check_dir out last status median
  sha="$(git rev-parse origin/main)"
  if [[ $sha == "$(state .checked)" ]]; then
    log "main at ${sha:0:7} already has a result."
    return 0
  fi
  idle="$(idle_seconds)"
  if ((!now && idle < idle_needed)); then
    log "Waiting to time main at ${sha:0:7}: input ${idle}s ago, under ${idle_needed}s."
    return 0
  fi

  check_dir="$(mktemp -d "${TMPDIR:-/tmp}/unmark-q47-check.XXXXXX")"
  git worktree add --quiet --detach "$check_dir" "$sha"
  out="$check_dir/.keystroke-to-preview"
  mkdir -p "$out"
  log "Building the renderer at ${sha:0:7}."
  if ! sh "$check_dir/scripts/build-renderer.sh" >"$out/build.log" 2>&1; then
    cat "$out/build.log"
    log "error: the renderer at ${sha:0:7} doesn't build; CI reports that. Trying again next run."
    return 1
  fi

  log "Timing main at ${sha:0:7} on $(sysctl -n hw.model), load average $(sysctl -n vm.loadavg)."
  last="$out/first.txt"
  status=0
  time_keystrokes "$check_dir" "$last" || status=$?
  if ((status == 1)); then
    # One run over budget can be another process's load; only a second in a row counts.
    log "Over budget once; timing it again."
    last="$out/second.txt"
    status=0
    time_keystrokes "$check_dir" "$last" || status=$?
  fi
  median="$(median_of "$last")"
  case $status in
    0)
      log "PASS main at ${sha:0:7}: median $median ms."
      set_commit_status "$sha" success "Median $median ms < 210 ms on $(sysctl -n hw.model)"
      ;;
    1)
      log "FAIL main at ${sha:0:7}: ${median:+median $median ms, }twice in a row."
      if [[ -n $median ]]; then
        set_commit_status "$sha" failure "Median $median ms >= 210 ms on $(sysctl -n hw.model)"
      else
        set_commit_status "$sha" failure "keystroke-to-preview.swift failed on $(sysctl -n hw.model)"
      fi
      report_failure "$sha" "$out/first.txt" "$out/second.txt"
      ;;
    3)
      log "Inconclusive at ${sha:0:7}; trying again next run."
      return 0
      ;;
    *)
      log "error: the harness exited $status at ${sha:0:7}; trying again next run."
      return 1
      ;;
  esac
  if ((!dry_run)); then
    update_state '.checked = $sha' --arg sha "$sha"
  fi
}

cmd_install_schedule() {
  require_intel
  # launchd runs the copy in the primary checkout, which outlives the worktree this may be run from.
  local script="$repo/scripts/perf/keystroke-to-preview-gate.sh"
  [[ -x $script ]] || {
    echo "error: $script is missing; sync main in $repo first." >&2
    exit 1
  }
  mkdir -p "$(dirname "$schedule_plist")" "$(dirname "$schedule_log")"
  # launchd starts jobs with a bare PATH; bd, gh, jq, and pnpm all live outside it.
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
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>StartInterval</key>
  <integer>900</integer>
  <key>StandardOutPath</key>
  <string>$schedule_log</string>
  <key>StandardErrorPath</key>
  <string>$schedule_log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$schedule_label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$schedule_plist"
  echo "Installed $schedule_label (every 15 min). Log: $schedule_log"
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
