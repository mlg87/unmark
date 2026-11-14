#!/usr/bin/env bash
# Checks a built Unmark.app against the acceptance criteria of the Sparkle integration (unmark-1793451444246-41-143393c8):
#   1. Launched with no reachable feed, a scheduled update check fails without an error dialog.
#   2. The Settings toggle reflects and changes SUEnableAutomaticChecks.
#   3. Check for Updates… offers a newer version advertised by a local appcast.
# The runner has no switch for its network, so an unreachable feed URL stands in for being offline. Each check runs a
# copy of the app whose Info.plist names its feed, re-signed ad hoc because the signature seals the Info.plist.
#
# usage: scripts/ci/check-updates.sh <path/to/Unmark.app>
set -euo pipefail

app="$1"
domain=com.mlg87.unmark
# Resolved, since LaunchServices starts the copies from /private/var, which pgrep has to match.
work="$(cd "$(mktemp -d)" && pwd -P)"
doc="$work/doc.md"
printf '# doc\n' > "$doc"
pid=""
server_pid=""

cleanup() {
  [[ -n $pid ]] && kill "$pid" 2> /dev/null
  [[ -n $server_pid ]] && kill "$server_pid" 2> /dev/null
  return 0
}
trap cleanup EXIT

fail() {
  echo "::error::$1"
  exit 1
}

# <feed URL> <copy path>
copy_with_feed() {
  rm -rf "$2"
  cp -R "$app" "$2"
  plutil -replace SUFeedURL -string "$1" "$2/Contents/Info.plist"
  codesign --force --sign - --options runtime "$2"
}

# <seconds> <command...>. Retries the command every half second until it succeeds, so a check waits only as long as
# the app takes, not for the slowest runner a fixed sleep would have to allow for (#163).
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

scheduled_check_ran() {
  [[ "$(defaults read "$domain" SULastCheckTime)" != 2000-01-01* ]]
}

# <app copy>. Opens the document too, since an empty launch shows the Open panel (q21).
launch() {
  open -n -a "$1" "$doc"
  pid=""
  for _ in {1..60}; do
    pid="$(pgrep -nf "^$1/Contents/MacOS/Unmark")" && break
    sleep 0.5
  done
  [[ -n $pid ]] || fail "$1 didn't launch; running: $(pgrep -lf Unmark)"
  # AppDelegate sets up Sparkle and the menu bar before AppKit opens the launch's document, so its window means both
  # are up.
  wait_until 30 window_exists doc.md || fail "$1 never opened $doc"
}

quit() {
  kill "$pid"
  for _ in {1..20}; do
    kill -0 "$pid" 2> /dev/null || break
    sleep 0.5
  done
  pid=""
}

# Every window of the app, then the text in it, one per line.
window_text() {
  osascript - "$pid" << 'EOF'
on run argv
  set output to {}
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      repeat with w in windows
        set end of output to "window: " & (name of w as text)
        -- Fetched first: `repeat with e in (entire contents of …)` can't resolve its items as references.
        set uiElements to entire contents of w
        repeat with e in uiElements
          try
            if role of e is "AXStaticText" then set end of output to ((value of e) as text)
          end try
        end repeat
      end repeat
    end tell
  end tell
  set AppleScript's text item delimiters to linefeed
  return output as text
end run
EOF
}

# <menu item title>, from the app menu.
click_app_menu_item() {
  osascript - "$pid" "$1" > /dev/null << 'EOF'
on run argv
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      set frontmost to true
      click menu item (item 2 of argv) of menu 1 of menu bar item 2 of menu bar 1
    end tell
  end tell
end run
EOF
}

# <value|click>. Settings has one checkbox, the Updates toggle; prints its value, after clicking it for `click`.
settings_toggle() {
  osascript - "$pid" "$1" << 'EOF'
on run argv
  tell application "System Events"
    tell (first process whose unix id is (item 1 of argv as integer))
      -- Fetched first: `repeat with e in (entire contents of …)` can't resolve its items as references.
      set uiElements to entire contents of window "Settings"
      repeat with e in uiElements
        if role of e is "AXCheckBox" then
          if item 2 of argv is "click" then
            click e
            delay 1
          end if
          return (value of e) as text
        end if
      end repeat
    end tell
  end tell
  error "Settings has no checkbox"
end run
EOF
}

automatic_checks_default() {
  defaults read "$domain" SUEnableAutomaticChecks
}

defaults delete "$domain" > /dev/null 2>&1 || true
# Past Sparkle's first launch, so it neither skips its check nor asks permission to check.
defaults write "$domain" SUHasLaunchedBefore -bool true

echo "== 1. No error dialog when the feed can't be reached"
offline="$work/offline/Unmark.app"
mkdir -p "$(dirname "$offline")"
# Nothing listens on the discard port, so the check fails as it would offline.
copy_with_feed "http://127.0.0.1:9/appcast.xml" "$offline"
defaults write "$domain" SUEnableAutomaticChecks -bool true
defaults write "$domain" SULastCheckTime -date "2000-01-01 00:00:00 +0000"
launch "$offline"
wait_until 30 scheduled_check_ran || fail "Sparkle never ran its scheduled check"
# Time for an error dialog to open, had the failed check raised one.
sleep 2
text="$(window_text)"
echo "$text"
last_check="$(defaults read "$domain" SULastCheckTime)"
echo "SULastCheckTime: $last_check"
[[ "$(grep '^window: ' <<< "$text")" == "window: doc.md" ]] || fail "Windows other than doc.md are open after a failed check"
quit

echo "== 2. The Settings toggle reflects and changes SUEnableAutomaticChecks"
defaults write "$domain" SUEnableAutomaticChecks -bool false
launch "$offline"
wait_until 10 click_app_menu_item "Settings…" || fail "Couldn't click Settings…"
wait_until 20 settings_toggle value || fail "Settings never showed its Updates toggle"
[[ "$(settings_toggle value)" == 0 ]] || fail "The toggle is on while SUEnableAutomaticChecks is false"
[[ "$(settings_toggle click)" == 1 ]] || fail "The toggle didn't turn on"
[[ "$(automatic_checks_default)" == 1 ]] || fail "Turning the toggle on left SUEnableAutomaticChecks $(automatic_checks_default)"
[[ "$(settings_toggle click)" == 0 ]] || fail "The toggle didn't turn off"
[[ "$(automatic_checks_default)" == 0 ]] || fail "Turning the toggle off left SUEnableAutomaticChecks $(automatic_checks_default)"
echo "SUEnableAutomaticChecks followed the toggle on and off"
quit

echo "== 3. Check for Updates… offers a newer version"
feed="$work/feed"
mkdir -p "$feed"
# Sparkle checks the signature only after downloading, so the offer needs neither a real archive nor signature.
cat > "$feed/appcast.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Unmark</title>
    <item>
      <title>99.0</title>
      <sparkle:version>9999</sparkle:version>
      <sparkle:shortVersionString>99.0</sparkle:shortVersionString>
      <enclosure url="http://127.0.0.1:8765/Unmark.zip" length="1" type="application/octet-stream"
        sparkle:edSignature="AAAA" />
    </item>
  </channel>
</rss>
EOF
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$feed" > "$work/server.log" 2>&1 &
server_pid=$!
online="$work/online/Unmark.app"
mkdir -p "$(dirname "$online")"
copy_with_feed "http://127.0.0.1:8765/appcast.xml" "$online"
launch "$online"
wait_until 10 click_app_menu_item "Check for Updates…" || fail "Couldn't click Check for Updates…"
offered=false
for _ in {1..60}; do
  sleep 0.5
  text="$(window_text)"
  # Sparkle's headline for an installable update; its "is available but…" texts mean it can't be installed.
  if grep -q "A new version of Unmark is available!" <<< "$text"; then
    offered=true
    break
  fi
done
echo "$text"
cat "$work/server.log"
$offered || fail "Check for Updates… didn't offer version 99.0"
quit
