#!/usr/bin/env bash
# Prints the notes of CHANGELOG.md's v<version> section, which prepare-release.sh wrote and the release PR may have
# edited. The release workflow publishes them in the GitHub release and the Sparkle appcast (#165); see
# docs/releasing.md.
#
#   release-notes.sh <version>
set -euo pipefail

readonly changelog=CHANGELOG.md

fail() {
    echo "error: $*" >&2
    exit 1
}

[[ $# == 1 ]] || fail "usage: $0 <version>"
readonly version=$1
cd "$(dirname "$0")/../.."
[[ -f $changelog ]] || fail "$changelog doesn't exist"

# From the line after `## v<version>` up to the next `## `, without the blank lines around it. Compared as a string, so
# the dots in the version aren't regex wildcards.
notes=$(awk -v heading="## v$version" '
    /^## / { if (found) exit; found = ($0 == heading || index($0, heading " ") == 1); next }
    found { lines[++n] = $0 }
    END {
        first = 1; while (first <= n && lines[first] == "") first++
        last = n; while (last >= first && lines[last] == "") last--
        for (i = first; i <= last; i++) print lines[i]
    }
' "$changelog")
[[ -n $notes ]] || fail "$changelog has no notes under \`## v$version\`; run the Release PR workflow (docs/releasing.md)"
printf '%s\n' "$notes"
