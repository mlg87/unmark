<img width="1904" height="640" alt="tigerglencoe_place_this_exact_hashtag_logo_on_the_left_of_a_w_c9eb6fb9-145c-479a-b6b3-a52d17bd98a0_0" src="https://github.com/user-attachments/assets/6827d451-aa42-4c75-b18b-b3a2b3b5f9c4" />

# unmark

## Install

### Homebrew

```sh
brew install mlg87/tap/unmark
```

This installs `/Applications/Unmark.app` and links the `unmark` command into
Homebrew's `bin` (`/opt/homebrew/bin` on Apple silicon, `/usr/local/bin` on
Intel). Unmark updates itself, so `brew upgrade` skips it unless you pass
`--greedy`. The cask lives in [mlg87/homebrew-tap](https://github.com/mlg87/homebrew-tap).

If Unmark is already installed, `brew install` fails with one of these:

- `It seems there is already a Binary at '/usr/local/bin/unmark'`: Settings →
  Install Command-Line Tool made that link, at the path Intel Homebrew uses
  too. Remove it with `sudo rm /usr/local/bin/unmark` and run `brew install`
  again; `--force` doesn't get past this. Settings then shows
  `Installed at /usr/local/bin/unmark` for Homebrew's link. Remove the link
  before using `--adopt` below: an `--adopt` that fails on the link deletes the
  existing app.
- `It seems there is already an App at '/Applications/Unmark.app'`: you
  installed it from the DMG. Run `brew install --adopt mlg87/tap/unmark` to
  hand that copy to Homebrew, or quit Unmark and move it to the Trash first.

## Development setup

Requirements:

- macOS 14 or later with Xcode 16.4 or later
- [Homebrew](https://brew.sh)
- Node.js 22.12 or later and [pnpm](https://pnpm.io). The app target's first build
  phase runs `scripts/build-renderer.sh`, which installs and builds the `renderer/`
  package into `App/Resources/Renderer/` on every build, so Xcode builds need them too.

```sh
make bootstrap   # install XcodeGen and SwiftLint from the Brewfile
make project     # generate Unmark.xcodeproj from project.yml
make build       # universal Release build in build/DerivedData
make test        # run the UnmarkCore package tests
make lint        # swift-format, SwiftLint, and Biome checks; run after every change
make format      # apply swift-format, SwiftLint, and Biome fixes
```

`make lint` needs `pnpm --dir renderer install` first so Biome is available.

`Unmark.xcodeproj` is generated and gitignored. Edit `project.yml` and rerun
`make project` instead of changing project settings in Xcode.

### Layout

| Path | Contents |
| --- | --- |
| `project.yml` | XcodeGen spec for the `Unmark` app target and the `unmark-cli` tool target |
| `App/` | AppKit app target (`NSDocument`, SwiftUI window content, ADR-0003); resources in `App/Resources/`. `App/Info.plist` is generated from `project.yml` |
| `App/Outline/` | The Outline: the sidebar (⌃⌘S) listing the document's headings, which scrolls the Preview to the one clicked and selects the one at its top |
| `App/Preview/` | The Preview: a WKWebView that loads the renderer and the document's files from the `unmark://app/` scheme |
| `App/Source/` | The Source: the editable NSTextView shown beside the Preview in Split mode (⇧⌘E), its markdown syntax colored in GitHub's code palette from `App/Resources/Assets.xcassets` |
| `CLI/` | The `unmark` command-line tool, embedded at `Unmark.app/Contents/Helpers/unmark` |
| `Packages/UnmarkCore/` | Swift package with pure, unit-tested logic (no AppKit or WebKit) |
| `renderer/` | pnpm package that bundles the markdown renderer into `App/Resources/Renderer/` |
| `renderer/patches/` | `pnpm patch` fixes to dependencies, applied by `pnpm install` |
| `scripts/` | Build and release scripts; `scripts/ci/` holds helpers the CI workflow runs, `scripts/release/` the DMG build |
| `Artwork/` | The owner's app icon artwork, square and at least 1024 px; `swift scripts/generate-app-icon.swift` renders `AppIcon.appiconset` from it |
| `docs/fixtures/` | Markdown documents for checking the Preview by hand, e.g. `kitchen-sink.md` |

## Command-line tool

```sh
unmark [--wait] <path>...
unmark --help | --version
```

`unmark` opens existing files in the Unmark app it ships inside, launching it if
needed, and exits 0. Missing paths print `unmark: <path>: No such file or directory`
and make it exit 1; it never creates files. Usage errors exit 2.

`--wait` returns only once every file it opened has its window closed, saved or
not, or Unmark quits, so `GIT_EDITOR="unmark --wait"` works. A file that's already
open gets its window brought forward and waited on. Files without a markdown
extension, like `COMMIT_EDITMSG`, open as markdown. The app announces closed
windows with the distributed notification `com.mlg87.unmark.documentClosed` and
answers `com.mlg87.unmark.queryOpen` with `com.mlg87.unmark.openPaths`, which the
tool polls every 2 s in case a notification was dropped. A file the app hasn't
listed as open 10 s after the open call, and 4 s after its first answer (it can't
answer while an alert is up), failed to open: the tool prints
`unmark: <path>: could not be opened`, stops waiting on it, and exits 1.

The binary is `Unmark.app/Contents/Helpers/unmark`, not `Contents/MacOS/unmark`:
on a case-insensitive volume that name would replace the app's own `Unmark`
executable. The tool resolves the symlink it's run through to find its app.

Settings (⌘,) → Command-Line Tool → Install Command-Line Tool links
`/usr/local/bin/unmark` to the tool in the running copy of Unmark, after the
standard admin password prompt. It shows `Installed at /usr/local/bin/unmark`
only while that link resolves to this copy's tool; a link left behind when the
app moved shows `Not installed` and a Reinstall button. If you cancel the
prompt or the install fails, a sheet gives the command to run in Terminal
instead:

```sh
sudo mkdir -p /usr/local/bin && sudo ln -sf '/Applications/Unmark.app/Contents/Helpers/unmark' /usr/local/bin/unmark
```

Settings also notes when `/usr/local/bin` isn't on the `PATH` that
`/usr/libexec/path_helper -s` reports.

`brew install mlg87/tap/unmark` links the tool for you; see [Homebrew](#homebrew)
if you installed it from Settings first.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`
on a `macos-15` runner with Xcode 16.4. A single job, `ci`, runs `make lint`, the
renderer tests, the renderer build (which fails if a dependency exceeds its
entry-chunk size budget in `renderer/build.mjs`), `make test`, and an ad-hoc signed
universal Release build. It then fails unless `lipo -archs` reports both `x86_64`
and `arm64` for the app and the embedded `unmark` tool, and checks the tool's exit
statuses for usage errors and missing files. Then it launches the app with
`unmark a.md b.md` and fails unless the tool exits 0 within 10 s and the app then
reports both files open, asked over `com.mlg87.unmark.queryOpen` by
`scripts/ci/open-documents.swift`. Then it runs `GIT_EDITOR="unmark --wait" git
commit` in a scratch repo and fails unless git is still running 5 s after the app
reports `COMMIT_EDITMSG` open, then commits the message once `osascript` clicks the
window's close button. Last, `scripts/ci/check-updates.sh` checks Sparkle in copies
of the app re-signed with a local feed URL: a scheduled check against an
unreachable feed opens no dialog, the Settings toggle reads and writes
`SUEnableAutomaticChecks`, and Check for Updates… offers a newer version from an
appcast served on `127.0.0.1`.

The `main: baseline` ruleset requires the `ci` check (pinned to the GitHub
Actions app) before a pull request can merge, so red builds can't land on
`main`. GitHub lists the check as `ci`; pull requests show it as `CI / ci`.

### Keystroke-to-preview on the oldest Mac

q47 holds typing in a 1 MB file to under 250 ms before the Preview shows it.
CI can't check that: the runner's WebKit timings vary 2x between runs. So
`scripts/perf/keystroke-to-preview-gate.sh` runs
`scripts/perf/keystroke-to-preview.swift` on the maintainer's 2019 i9 MacBook
Pro, of the oldest generation macOS 14 supports, once for each new `main`. It
needs the harness's window in front, so it waits until nobody has used the
keyboard or mouse for 2 minutes, and retries a run the window lost focus in or
one on a locked screen. A pass sets the `q47 keystroke-to-preview` status on the
commit. A median over 210 ms (250 ms less the 40 ms edit debounce) twice in a
row sets a failure status and files a GitHub issue and a bead. launchd checks
every 15 minutes once you run `scripts/perf/keystroke-to-preview-gate.sh
install-schedule` in the primary checkout; the log is
`~/Library/Logs/unmark-keystroke-to-preview-gate.log`.

## Releasing

`scripts/release/build-dmg.sh <version>` builds a universal, Developer ID
signed, notarized, and stapled `Unmark-<version>.dmg`, and fails if it's 30 MB
or more. The Release workflow runs it in CI. On a `v*` tag it also publishes
the DMG and Sparkle appcast to a GitHub release and bumps the cask in
[mlg87/homebrew-tap](https://github.com/mlg87/homebrew-tap).
[docs/releasing.md](docs/releasing.md) covers the certificate, the notary
credentials and repository secrets, the tap, running it on a Mac with Xcode,
and renewing the certificate before it expires on 2027-12-13.

## License

[MIT](LICENSE)
