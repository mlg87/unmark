#!/usr/bin/env bash
# Sets `version` and `sha256` in the Homebrew cask (Casks/unmark.rb in mlg87/homebrew-tap) to the published
# Unmark-<version>.dmg. The release workflow runs it after the GitHub release v<version> exists, then commits the cask
# to the tap; see docs/releasing.md.
#
#   bump-tap-cask.sh <cask file> <version>
set -euo pipefail

readonly releases=https://github.com/mlg87/unmark/releases

fail() {
    echo "error: $*" >&2
    exit 1
}

step() {
    echo "==> $*"
}

[[ $# == 2 ]] || fail "usage: $0 <cask file> <version>"
readonly cask=$1 version=$2
[[ -f $cask ]] || fail "$cask doesn't exist"
# The cask builds its url from the version, so it must not contain characters that would need escaping there or in sed.
[[ $version =~ ^[0-9]+(\.[0-9]+)+(-[A-Za-z0-9.]+)?$ ]] || fail "$version isn't a version like 1.2.3 or 1.2.3-rc1"

# The hash of the DMG at the cask's url, rather than of the build's copy, so it's what `brew install` downloads.
readonly url="$releases/download/v$version/Unmark-$version.dmg"
dmg=$(mktemp)
trap 'rm -f "$dmg"' EXIT
step "Downloading $url"
curl -fsSL --retry 3 -o "$dmg" "$url" || fail "couldn't download $url"
sha256=$(shasum -a 256 "$dmg" | cut -d ' ' -f 1)

for stanza in version sha256; do
    count=$(grep -cE "^  $stanza \"[^\"]*\"$" "$cask" || true)
    [[ $count == 1 ]] || fail "$cask has $count \`$stanza \"…\"\` lines, expected 1"
done

step "Setting $cask to $version, sha256 $sha256"
sed -E -i.bak \
    -e "s/^  version \"[^\"]*\"$/  version \"$version\"/" \
    -e "s/^  sha256 \"[^\"]*\"$/  sha256 \"$sha256\"/" \
    "$cask"
rm -f "$cask.bak"
