#!/usr/bin/env bash
# Builds build/release/Unmark-<version>.dmg: a universal, Developer ID signed, notarized, and stapled DMG, as
# Gatekeeper requires for an app distributed outside the App Store (ADR-0002). Runs in .github/workflows/release.yml
# and on any Mac with Xcode; see docs/releasing.md for the certificate and notary credentials it needs.
#
#   build-dmg.sh <version>
#
# Notary credentials, the first set that's present:
#   NOTARY_KEY_P8 (the .p8's PEM contents), NOTARY_KEY_ID, NOTARY_ISSUER_ID: an App Store Connect API key (CI).
#   NOTARY_KEYCHAIN_PROFILE (default unmark-notary): a `notarytool store-credentials` profile.
# UNMARK_DMG_MAX_MB (default 30, epic #10's budget) is the size the DMG must stay under, in MB of 1,000,000 bytes as
# Finder counts them. Lowered only to check that the gate fails.
set -euo pipefail

readonly team_id=C33CHKC73H
readonly identity="Developer ID Application"
readonly max_mb="${UNMARK_DMG_MAX_MB:-30}"

fail() {
    echo "error: $*" >&2
    exit 1
}

step() {
    echo "==> $*"
}

check_size() {
    local bytes
    bytes=$(stat -f %z "$dmg")
    if ((bytes >= max_mb * 1000 * 1000)); then
        fail "$dmg is $bytes bytes, over the ${max_mb} MB budget (epic #10). Find what grew before raising it."
    fi
    echo "$dmg is $bytes bytes, under the ${max_mb} MB budget"
}

[[ $# == 1 ]] || fail "usage: $0 <version>"
readonly version=$1
# Ends up in CFBundleShortVersionString and the DMG's file name.
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || fail "version '$version' isn't like 1.2.3 or 1.2.3-beta.1"

cd "$(dirname "$0")/../.."
readonly out=build/release
readonly archive="$out/Unmark.xcarchive"
readonly export_dir="$out/export"
readonly app="$export_dir/Unmark.app"
readonly dmg_root="$out/dmg-root"
readonly dmg="$out/Unmark-$version.dmg"

security find-identity -v -p codesigning | grep -q "\"$identity: .*($team_id)\"" ||
    fail "no valid '$identity' identity for team $team_id in the keychain search list (docs/releasing.md)"

secrets=$(mktemp -d)
trap 'rm -rf "$secrets"' EXIT
if [[ -n ${NOTARY_KEY_P8:-} ]]; then
    : "${NOTARY_KEY_ID:?NOTARY_KEY_ID must accompany NOTARY_KEY_P8}"
    : "${NOTARY_ISSUER_ID:?NOTARY_ISSUER_ID must accompany NOTARY_KEY_P8}"
    key_file="$secrets/AuthKey_$NOTARY_KEY_ID.p8"
    printf '%s\n' "$NOTARY_KEY_P8" >"$key_file"
    notary_auth=(--key "$key_file" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID")
else
    notary_auth=(--keychain-profile "${NOTARY_KEYCHAIN_PROFILE:-unmark-notary}")
fi

rm -rf "$out"
mkdir -p "$out"

step "Archiving Unmark $version"
make project
# project.yml signs to run locally so builds need no certificate; a release signs with Developer ID instead, with a
# secure timestamp and without get-task-allow, both of which notarization requires.
xcodebuild archive -project Unmark.xcodeproj -scheme Unmark -configuration Release \
    -destination 'generic/platform=macOS' -archivePath "$archive" \
    MARKETING_VERSION="$version" CURRENT_PROJECT_VERSION="$(git rev-list --count HEAD)" \
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$identity" DEVELOPMENT_TEAM="$team_id" \
    OTHER_CODE_SIGN_FLAGS=--timestamp CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO

step "Exporting with Developer ID"
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$export_dir" \
    -exportOptionsPlist scripts/release/ExportOptions.plist

step "Verifying the app's signature and architectures"
codesign --verify --deep --strict --verbose=2 "$app" || fail "$app failed codesign --verify --deep --strict"
for binary in "$app/Contents/MacOS/Unmark" "$app/Contents/Helpers/unmark"; do
    archs=$(lipo -archs "$binary")
    echo "$binary: $archs"
    for arch in x86_64 arm64; do
        [[ " $archs " == *" $arch "* ]] || fail "$binary is missing $arch (got: $archs)"
    done
done

step "Creating $dmg"
mkdir -p "$dmg_root"
ditto "$app" "$dmg_root/Unmark.app"
ln -s /Applications "$dmg_root/Applications"
# hdiutil on GitHub's macOS runners intermittently fails with "Resource busy" while something else still holds the
# source folder, so it gets a few tries.
for attempt in 1 2 3; do
    hdiutil create -volname Unmark -srcfolder "$dmg_root" -format UDZO -ov "$dmg" && break
    ((attempt < 3)) || fail "hdiutil create failed $attempt times"
    sleep 5
done
codesign --sign "$identity" --timestamp "$dmg"

# Checked before notarizing too, which can take half an hour, so an oversized DMG fails fast. The stapled ticket adds
# only a few KB.
check_size

step "Notarizing $dmg"
# notarytool exits non-zero when --timeout runs out, with the submission ID and a message instead of a status.
submission=$(xcrun notarytool submit "$dmg" "${notary_auth[@]}" --wait --timeout 30m --output-format json) || true
echo "$submission"
submission_id=$(plutil -extract id raw -o - - <<<"$submission") || fail "notarytool didn't submit $dmg"
status=$(plutil -extract status raw -o - - <<<"$submission") ||
    fail "notarization of $dmg didn't finish (submission $submission_id). Check it with: xcrun notarytool info $submission_id"
if [[ $status != Accepted ]]; then
    xcrun notarytool log "$submission_id" "${notary_auth[@]}" >&2 || true
    fail "notarization of $dmg ended '$status' (submission $submission_id); its log is above"
fi
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
assessment=$(spctl --assess -vv --type install "$dmg" 2>&1) || fail "Gatekeeper rejected $dmg: $assessment"
echo "$assessment"
[[ $assessment == *"source=Notarized Developer ID"* ]] || fail "Gatekeeper doesn't see $dmg as notarized: $assessment"

check_size
echo "Built $dmg"
