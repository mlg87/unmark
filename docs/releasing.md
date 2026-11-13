# Releasing

Unmark ships outside the Mac App Store as a notarized DMG (ADR-0002). `scripts/release/build-dmg.sh <version>` builds it:

1. `make project`, then `xcodebuild archive` of the universal Release build, with `MARKETING_VERSION=<version>` and `CURRENT_PROJECT_VERSION` set to `git rev-list --count HEAD`. The archive signs with the Developer ID Application certificate, a secure timestamp, and the hardened runtime that `project.yml` turns on for the app and the `unmark` tool.
2. `xcodebuild -exportArchive` with `scripts/release/ExportOptions.plist`: method `developer-id`, signed manually, so it needs no Apple Development certificate or Xcode account login.
3. `codesign --verify --deep --strict` on the app, and `lipo -archs` must list `x86_64` and `arm64` for `Contents/MacOS/Unmark` and `Contents/Helpers/unmark`.
4. `hdiutil` packs the app and an `/Applications` symlink into `build/release/Unmark-<version>.dmg`, which is then signed.
5. The DMG must be under 30 MB (1,000,000-byte MB, as Finder counts them), epic #10's budget. It's checked before notarizing, so an oversized DMG fails fast, and again after stapling. `UNMARK_DMG_MAX_MB` overrides the limit, only to check that the gate fails.
6. `xcrun notarytool submit --wait` notarizes the DMG and `xcrun stapler staple` attaches the ticket, so Gatekeeper accepts it offline. A rejected submission prints its notary log. The script then requires `spctl` to report `source=Notarized Developer ID`.

Notarization usually takes minutes but can take much longer; the team's first two submissions, on 2026-11-13, were still in progress after 30 minutes. After 30 minutes the script fails with the submission ID. `xcrun notarytool info <id>` shows whether Apple accepted it later; rerun the script for a stapled DMG.

`project.yml` keeps `CODE_SIGN_IDENTITY: "-"` (sign to run locally), so `make build` and CI's build need no certificate. Only the release script signs with Developer ID.

## In GitHub Actions

Run the **Release** workflow (`.github/workflows/release.yml`) from the Actions tab, or `gh workflow run release.yml -f version=1.2.3`. It imports the certificate into a temporary keychain, runs `build-dmg.sh`, and uploads `Unmark-<version>.dmg` as a workflow artifact. It publishes nothing.

To check a downloaded DMG on any Mac, including one with only the Command Line Tools:

```sh
spctl -a -vv -t install Unmark-1.2.3.dmg   # source=Notarized Developer ID
xcrun stapler validate Unmark-1.2.3.dmg
```

## On a Mac with Xcode

`xcodebuild archive` needs full Xcode 16.4 or later; the Command Line Tools aren't enough. With the [development setup](../README.md#development-setup) done and the Developer ID Application certificate in your login keychain:

1. Store the notary API key in the keychain once, as the profile the script uses by default:

   ```sh
   xcrun notarytool store-credentials unmark-notary \
     --key /path/to/AuthKey_MW96UZNAUH.p8 --key-id MW96UZNAUH \
     --issuer 84f05c5e-87e3-4275-97e6-77267e7642fd
   ```

2. Run `scripts/release/build-dmg.sh 1.2.3`.

`NOTARY_KEYCHAIN_PROFILE` picks another profile. Setting `NOTARY_KEY_P8` (the `.p8` file's contents), `NOTARY_KEY_ID`, and `NOTARY_ISSUER_ID` uses the API key directly instead, as CI does.

## Accounts and credentials

The Account Holder set these up outside the repo on 2026-11-13.

- **Apple Developer Program**, team ID `C33CHKC73H`. `project.yml` sets it as `DEVELOPMENT_TEAM`.
- **Developer ID Application certificate**, valid until 2027-12-13. Created at [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list) from a Keychain Access certificate signing request, so its private key lives in the maintainer's login keychain. Macs without Xcode lack the [Developer ID G2 intermediate](https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer); until it's added to the keychain, `security find-identity -v -p codesigning` doesn't count the certificate as valid. Once it's there, Keychain Access exports it into the `.p12` along with the certificate, so the release workflow's keychain gets it too.
- **App Store Connect API Team key** `MW96UZNAUH`, issuer `84f05c5e-87e3-4275-97e6-77267e7642fd`, created under [Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api). Apple lets you download its `.p8` only once; it's stored outside the repo.

### Repository secrets

| Secret | Contents | Source |
| --- | --- | --- |
| `DEVELOPER_ID_P12_BASE64` | The certificate and its private key as a base64-encoded `.p12` | Keychain Access → My Certificates → the Developer ID Application certificate → Export, then `base64 -i Unmark.p12` |
| `DEVELOPER_ID_P12_PASSWORD` | The `.p12`'s export password | Chosen at export |
| `KEYCHAIN_PASSWORD` | Password for the workflow's temporary keychain | Any random string, e.g. `openssl rand -base64 32` |
| `NOTARY_KEY_P8` | The API key's `.p8` file, raw PEM text | `AuthKey_MW96UZNAUH.p8` |
| `NOTARY_KEY_ID` | `MW96UZNAUH` | The API key's Key ID |
| `NOTARY_ISSUER_ID` | `84f05c5e-87e3-4275-97e6-77267e7642fd` | Issuer ID on the API keys page |

Set them with `gh secret set <NAME> < file` (or `--body`), never with the value on a command line that lands in shell history. Secrets can't be read back, so a wrong `.p12` password first shows up as a failed `security import` in the Release workflow.

Keychain Access exports the legacy PKCS#12 format (RC2 certificate bag, 3DES key bag, SHA-1 MAC). `security import` reads it; OpenSSL 3 needs `-legacy` to inspect it, e.g. `openssl pkcs12 -legacy -info -in Unmark.p12 -noout`.

## Renewing the certificate before 2027-12-13

DMGs already notarized keep opening after the certificate expires, because their signatures carry a secure timestamp. Only new releases need a valid certificate.

1. A month or so before expiry, the Account Holder creates a new Developer ID Application certificate from a fresh Keychain Access certificate signing request and installs it in the login keychain.
2. Export the new certificate with its private key as a `.p12`, then replace the secrets: `base64 -i Unmark.p12 | gh secret set DEVELOPER_ID_P12_BASE64` and `gh secret set DEVELOPER_ID_P12_PASSWORD`.
3. Run the Release workflow with a test version such as `0.0.0-renewal`, and check its DMG with `spctl` as above.
4. Delete the old certificate from the login keychain. `build-dmg.sh` signs as `Developer ID Application`, which `codesign` rejects as ambiguous while two such certificates are valid.
5. Update the expiry date in this file.

The App Store Connect API key doesn't expire; revoke it and replace the three `NOTARY_*` secrets (and your keychain profile) if it leaks.
