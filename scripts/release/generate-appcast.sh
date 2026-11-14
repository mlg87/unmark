#!/usr/bin/env bash
# Writes build/release/appcast/appcast.xml, the Sparkle feed for build/release/Unmark-<version>.dmg, which
# build-dmg.sh must have built. The release workflow publishes both to the GitHub release v<version>; see
# docs/releasing.md.
#
#   generate-appcast.sh <version>
#
# SPARKLE_ED_PRIVATE_KEY: the EdDSA private key (`generate_keys -x`) whose public half is SUPublicEDKey in project.yml.
# SPARKLE_BIN: the folder holding Sparkle's generate_appcast and sign_update. Defaults to the copy that Xcode resolved
# for the archive, so the tools match the Sparkle version in the app.
set -euo pipefail

# SUFeedURL in project.yml is this URL's latest/download/appcast.xml.
readonly releases=https://github.com/mlg87/unmark/releases

fail() {
    echo "error: $*" >&2
    exit 1
}

step() {
    echo "==> $*"
}

[[ $# == 1 ]] || fail "usage: $0 <version>"
readonly version=$1
[[ -n ${SPARKLE_ED_PRIVATE_KEY:-} ]] || fail "SPARKLE_ED_PRIVATE_KEY isn't set (docs/releasing.md)"

cd "$(dirname "$0")/../.."
readonly dmg_name="Unmark-$version.dmg"
readonly feed=build/release/appcast
readonly download_prefix="$releases/download/v$version/"
[[ -f build/release/$dmg_name ]] || fail "build/release/$dmg_name doesn't exist; run build-dmg.sh $version first"

if [[ -n ${SPARKLE_BIN:-} ]]; then
    sparkle_bin=$SPARKLE_BIN
else
    shopt -s nullglob
    candidates=("$HOME"/Library/Developer/Xcode/DerivedData/Unmark-*/SourcePackages/artifacts/sparkle/Sparkle/bin)
    shopt -u nullglob
    ((${#candidates[@]} == 1)) ||
        fail "expected one Sparkle bin folder in DerivedData, found ${#candidates[@]}; set SPARKLE_BIN"
    sparkle_bin=${candidates[0]}
fi

rm -rf "$feed"
mkdir -p "$feed"
cp "build/release/$dmg_name" "$feed/"

step "Fetching the current appcast"
# generate_appcast adds the new item to the appcast it finds in the folder and keeps the other items as they are. The
# previous DMGs stay out of the folder: generate_appcast would rewrite their URLs to this release's download prefix,
# where they don't exist.
status=$(curl -sSL --retry 3 -o "$feed/appcast.xml" -w '%{http_code}' "$releases/latest/download/appcast.xml") ||
    fail "couldn't download $releases/latest/download/appcast.xml"
case $status in
    200) echo "Adding to the appcast of the latest release" ;;
    404)
        rm -f "$feed/appcast.xml"
        echo "No release has an appcast yet; starting a new one"
        ;;
    *) fail "$releases/latest/download/appcast.xml returned HTTP $status" ;;
esac

step "Generating the appcast for $dmg_name"
"$sparkle_bin/generate_appcast" --ed-key-file - --download-url-prefix "$download_prefix" "$feed" \
    <<<"$SPARKLE_ED_PRIVATE_KEY"

# generate_appcast only warns when the key doesn't match the app's SUPublicEDKey, and then leaves the item unsigned.
signature=$(xmllint --xpath "string(//enclosure[@url='$download_prefix$dmg_name']/@*[local-name()='edSignature'])" \
    "$feed/appcast.xml") || fail "$feed/appcast.xml has no item for $download_prefix$dmg_name"
[[ -n $signature ]] ||
    fail "the appcast item for $dmg_name is unsigned; SPARKLE_ED_PRIVATE_KEY likely doesn't match SUPublicEDKey"
"$sparkle_bin/sign_update" --verify "$feed/$dmg_name" "$signature" --ed-key-file - <<<"$SPARKLE_ED_PRIVATE_KEY" ||
    fail "the appcast's signature for $dmg_name doesn't verify"

cat "$feed/appcast.xml"
echo "Wrote $feed/appcast.xml"
