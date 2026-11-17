#!/usr/bin/env bash
# Checks a built Unmark.app's document window through the accessibility API, as a user would drive it:
#   1. A link to a sibling markdown file opens that file's window however it's followed (unmark-eg8): a click, and
#      Open Link and Open Link in New Window from the Preview's context menu.
#   2. Split mode puts the Source on the side View → Source on Right chooses, and remembers it (unmark-ilr).
# Every check runs even after one fails, so one run reports all of them.
#
# usage: scripts/ci/check-document-window.sh <path/to/Unmark.app>
set -euo pipefail

app="$1"
domain=com.mlg87.unmark
side_key=sourcePaneSide
# Resolved, since the app reports and titles documents by their real paths.
work="$(cd "$(mktemp -d)" && pwd -P)"
pid=""
failures=0

cleanup() {
  [[ -n $pid ]] && kill "$pid" 2> /dev/null
  defaults delete "$domain" "$side_key" > /dev/null 2>&1 || true
  return 0
}
trap cleanup EXIT

fail() {
  echo "::error::$1"
  failures=$((failures + 1))
}

# <seconds> <command...>. Retries the command every half second until it succeeds.
wait_until() {
  local tries=$(($1 * 2))
  shift
  for ((; tries > 0; tries--)); do
    "$@" > /dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

# <window name>. Fails until the app has a window of that name.
window_exists() {
  osascript - "$pid" "$1" << 'EOF'
on run argv
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      if not (exists window (item 2 of argv)) then error "no window named " & (item 2 of argv)
    end tell
  end tell
end run
EOF
}

# <document>. Launches the app on it, once any earlier copy has quit, and waits for its window.
launch() {
  for _ in {1..20}; do
    pgrep -f "^$app/Contents/MacOS/Unmark" > /dev/null || break
    sleep 0.5
  done
  open -n -a "$app" "$1"
  pid=""
  for _ in {1..60}; do
    pid="$(pgrep -nf "^$app/Contents/MacOS/Unmark")" && break
    sleep 0.5
  done
  if [[ -z $pid ]]; then
    echo "::error::$app didn't launch; running: $(pgrep -lf Unmark)"
    exit 1
  fi
  if ! wait_until 30 window_exists "$(basename "$1")"; then
    echo "::error::$app never opened $1"
    exit 1
  fi
}

quit() {
  kill "$pid"
  for _ in {1..20}; do
    kill -0 "$pid" 2> /dev/null || break
    sleep 0.5
  done
  pid=""
}

# <window name>. The role, name, and description of every element in the window, for a failed check's log.
describe_window() {
  osascript - "$pid" "$1" << 'EOF' || true
on run argv
  set output to {}
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      -- Fetched first: `repeat with e in (entire contents of …)` can't resolve its items as references.
      set uiElements to entire contents of window (item 2 of argv)
      repeat with e in uiElements
        set entry to ""
        try
          set entry to (role of e as text)
        end try
        try
          set entry to entry & " name=" & (name of e as text)
        end try
        try
          set entry to entry & " description=" & (description of e as text)
        end try
        set end of output to entry
      end repeat
    end tell
  end tell
  set AppleScript's text item delimiters to linefeed
  return output as text
end run
EOF
}

# <window name> <link text> <find|press|menu item title>. Follows the link the Preview shows with that text: `press`
# clicks it, and anything else picks that item from the link's context menu. `find` only fails until the link exists.
follow_link() {
  osascript - "$pid" "$1" "$2" "$3" << 'EOF'
on run argv
  set windowName to item 2 of argv
  set linkText to item 3 of argv
  set how to item 4 of argv
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      set frontmost to true
      perform action "AXRaise" of window windowName
      set theLink to my elementOf(entire contents of window windowName, "AXLink", linkText)
      if theLink is missing value then error "the Preview has no link named " & linkText
      if how is "find" then return
      if how is "press" then
        perform action "AXPress" of theLink
        return
      end if
      -- WebKit shows the menu from its own process, so the action returns before the menu is up.
      try
        perform action "AXShowMenu" of theLink
      end try
      repeat 20 times
        delay 0.5
        set menuItem to my elementOf(entire contents of window windowName, "AXMenuItem", how)
        if menuItem is not missing value then
          click menuItem
          return
        end if
      end repeat
      -- Closes a menu that opened without the item, so the app isn't left tracking it.
      key code 53
      error "the link's context menu has no item named " & how
    end tell
  end tell
end run

-- The first of `uiElements` with that role whose name, title, or description is `label`.
on elementOf(uiElements, wantedRole, label)
  tell application "System Events"
    repeat with e in uiElements
      try
        if role of e is wantedRole then
          set labels to {}
          try
            set end of labels to (name of e as text)
          end try
          try
            set end of labels to (title of e as text)
          end try
          try
            set end of labels to (description of e as text)
          end try
          if labels contains label then return contents of e
        end if
      end try
    end repeat
  end tell
  return missing value
end elementOf
EOF
}

# <menu item title>, from the View menu.
click_view_menu_item() {
  osascript - "$pid" "$1" > /dev/null << 'EOF'
on run argv
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      set frontmost to true
      click menu item (item 2 of argv) of menu 1 of menu bar item "View" of menu bar 1
    end tell
  end tell
end run
EOF
}

# <window name>. Prints `left` or `right`: the side of the Preview the Source is on. Fails outside Split mode.
source_side() {
  osascript - "$pid" "$1" << 'EOF'
on run argv
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      set sourceX to missing value
      set previewX to missing value
      -- Fetched first: `repeat with e in (entire contents of …)` can't resolve its items as references.
      set uiElements to entire contents of window (item 2 of argv)
      repeat with e in uiElements
        try
          set theRole to role of e
          -- The Source is the window's only text area, and the Preview its only web area.
          if theRole is "AXTextArea" and sourceX is missing value then set sourceX to item 1 of (position of e)
          if theRole is "AXWebArea" and previewX is missing value then set previewX to item 1 of (position of e)
        end try
      end repeat
      if sourceX is missing value then error "the window has no Source"
      if previewX is missing value then error "the window has no Preview"
      if sourceX < previewX then return "left"
      return "right"
    end tell
  end tell
end run
EOF
}

# <window name> <left|right>. Fails until the Source is on that side.
source_is_on() {
  [[ "$(source_side "$1")" == "$2" ]]
}

side_default() {
  defaults read "$domain" "$side_key"
}

defaults delete "$domain" "$side_key" > /dev/null 2>&1 || true

echo "== 1. A link to a sibling markdown file opens its window however it's followed"
links="$work/links"
mkdir -p "$links"
cat > "$links/index.md" << 'EOF'
# index

[clicked](clicked.md)

[opened](opened.md)

[new window](new-window.md)
EOF
for name in clicked opened new-window; do
  printf '# %s\n' "$name" > "$links/$name.md"
done
launch "$links/index.md"

# <link text> <press|menu item title> <file the link names>
check_link() {
  local error
  if ! error="$(follow_link index.md "$1" "$2" 2>&1)"; then
    fail "Couldn't follow the '$1' link with '$2': $error"
    describe_window index.md
    return
  fi
  if wait_until 15 window_exists "$3"; then
    echo "'$2' on the '$1' link opened $3"
  else
    fail "'$2' on the '$1' link didn't open $3"
  fi
  wait_until 5 window_exists index.md || fail "'$2' on the '$1' link closed index.md"
}

# The Preview's accessibility tree fills in once something asks for it, so the first link may take a moment.
wait_until 20 follow_link index.md clicked find || true
check_link clicked press clicked.md
check_link opened "Open Link" opened.md
check_link "new window" "Open Link in New Window" new-window.md
quit

echo "== 2. Split mode puts the Source on the chosen side"
split="$work/split"
mkdir -p "$split"
printf '# split\n\ntext\n' > "$split/split.md"
launch "$split/split.md"
wait_until 10 click_view_menu_item "Show Source" || fail "Couldn't click View → Show Source"
if wait_until 20 source_is_on split.md left; then
  echo "The Source starts on the left"
else
  fail "With no default, the Source isn't on the Preview's left: $(source_side split.md 2>&1)"
  describe_window split.md
fi
if wait_until 10 click_view_menu_item "Source on Right"; then
  if wait_until 20 source_is_on split.md right; then
    echo "View → Source on Right moved the Source to the right"
  else
    fail "View → Source on Right left the Source on the $(source_side split.md 2>&1)"
  fi
  [[ "$(side_default)" == right ]] || fail "View → Source on Right left $side_key '$(side_default 2>&1)'"
else
  fail "Couldn't click View → Source on Right"
fi
quit

# A new launch reads the side the last one chose.
defaults write "$domain" "$side_key" right
launch "$split/split.md"
wait_until 10 click_view_menu_item "Show Source" || fail "Couldn't click View → Show Source"
if wait_until 20 source_is_on split.md right; then
  echo "A relaunch kept the Source on the right"
else
  fail "With $side_key right, the Source isn't on the Preview's right: $(source_side split.md 2>&1)"
fi
quit

if ((failures > 0)); then
  echo "::error::$failures document window checks failed"
  exit 1
fi
echo "Every document window check passed"
