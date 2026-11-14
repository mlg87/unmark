#!/usr/bin/env bash
# Adds the next release's notes to CHANGELOG.md and prints its version. The Release PR workflow runs it on main, then
# opens the release PR whose merge publishes that version (#165); see docs/releasing.md.
#
#   prepare-release.sh [version]
#
# Without a version, the Conventional Commit subjects since the last v* tag pick it: a breaking change (`type!:` or a
# `BREAKING CHANGE:` footer) bumps the major version, a `feat` the minor, anything else the patch. Below 1.0.0 a
# breaking change bumps the minor instead, because 0.x promises no compatibility. After a prerelease such as 0.0.1-rc1,
# a bump that 0.0.1 already covers releases 0.0.1 itself.
#
# gh must be able to write the repo's contents, which GitHub's generate-notes endpoint requires even though it writes
# nothing.
set -euo pipefail

readonly repo=mlg87/unmark
readonly changelog=CHANGELOG.md

fail() {
    echo "error: $*" >&2
    exit 1
}

# To stderr, because stdout carries only the version.
step() {
    echo "==> $*" >&2
}

[[ $# -le 1 ]] || fail "usage: $0 [version]"
cd "$(dirname "$0")/../.."
[[ -f $changelog ]] || fail "$changelog doesn't exist"

last_tag=$(git describe --tags --abbrev=0 --match 'v[0-9]*' HEAD 2>/dev/null) || last_tag=
readonly last_tag range=${last_tag:+$last_tag..}HEAD
[[ -n $(git rev-list -n 1 "$range") ]] || fail "nothing was merged since $last_tag"

next_version() {
    local last=${last_tag#v}
    last=${last:-0.0.0}
    local core=${last%%-*}
    local major minor patch bump subjects bodies
    IFS=. read -r major minor patch <<<"$core"

    # Squash merges put the PR title in the subject; a body can list the branch's commits, so only subjects carry types.
    # Read in full first: with pipefail, grep -q exiting early would fail the pipe with git's SIGPIPE.
    subjects=$(git log --format=%s "$range")
    bodies=$(git log --format=%b "$range")
    if grep -qE '^[a-z]+(\([^)]*\))?!:' <<<"$subjects" || grep -qE '^BREAKING[ -]CHANGE:' <<<"$bodies"; then
        bump=major
    elif grep -qE '^feat(\([^)]*\))?:' <<<"$subjects"; then
        bump=minor
    else
        bump='patch'
    fi
    [[ $bump == major && $major == 0 ]] && bump=minor

    if [[ $core != "$last" ]]; then
        # A prerelease of core: release core unless the bump goes past it.
        case $bump in
            minor) ((patch == 0)) || { minor=$((minor + 1)) && patch=0; } ;;
            major) ((minor == 0 && patch == 0)) || { major=$((major + 1)) && minor=0 && patch=0; } ;;
        esac
    else
        case $bump in
            patch) patch=$((patch + 1)) ;;
            minor) minor=$((minor + 1)) && patch=0 ;;
            major) major=$((major + 1)) && minor=0 && patch=0 ;;
        esac
    fi
    echo "$major.$minor.$patch"
}

version=${1:-$(next_version)}
readonly version
# The same shapes as bump-tap-cask.sh and the cask's livecheck accept.
[[ $version =~ ^[0-9]+(\.[0-9]+)+(-[A-Za-z0-9.]+)?$ ]] || fail "$version isn't a version like 1.2.3 or 1.2.3-rc1"
! git rev-parse -q --verify "refs/tags/v$version" >/dev/null || fail "the tag v$version already exists"
! grep -qE "^## v${version//./\\.}( |$)" "$changelog" || fail "$changelog already has a v$version section"

step "Generating the notes for v$version, from ${last_tag:-the first commit} to $(git rev-parse --short HEAD)"
args=(-f tag_name="v$version" -f target_commitish="$(git rev-parse HEAD)")
[[ -z $last_tag ]] || args+=(-f previous_tag_name="$last_tag")
notes=$(gh api "repos/$repo/releases/generate-notes" "${args[@]}" --jq .body)

step "Adding v$version to $changelog"
# One heading level down, so the notes' own `## What's Changed` sits under the version's `##` and release-notes.sh can
# end the section at the next `## `.
section=$(printf '## v%s (%s)\n\n%s\n' "$version" "$(date -u +%F)" "$(sed -E 's/^(#{1,5}) /#\1 /' <<<"$notes")")
# Above the newest version, or at the end while there is none. Passed through the environment, because awk -v would
# expand backslash escapes in the notes.
section=$section awk '
    !done && /^## / { print ENVIRON["section"]; print ""; done = 1 }
    { print }
    END { if (!done) { print ""; print ENVIRON["section"] } }
' "$changelog" >"$changelog.new"
mv -f "$changelog.new" "$changelog"

echo "$version"
