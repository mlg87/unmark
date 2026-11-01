# unmark

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
| `App/Preview/` | The Preview: a WKWebView that loads the renderer and the document's files from the `unmark://app/` scheme |
| `App/Source/` | The Source: the editable NSTextView shown beside the Preview in Split mode (⇧⌘E), its markdown syntax colored in GitHub's code palette from `App/Resources/Assets.xcassets` |
| `CLI/` | The `unmark` command-line tool, embedded at `Unmark.app/Contents/Helpers/unmark` |
| `Packages/UnmarkCore/` | Swift package with pure, unit-tested logic (no AppKit or WebKit) |
| `renderer/` | pnpm package that bundles the markdown renderer into `App/Resources/Renderer/` |
| `renderer/patches/` | `pnpm patch` fixes to dependencies, applied by `pnpm install` |
| `scripts/` | Build and release scripts; `scripts/ci/` holds helpers the CI workflow runs |
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
tool polls every 2 s in case a notification was dropped.

The binary is `Unmark.app/Contents/Helpers/unmark`, not `Contents/MacOS/unmark`:
on a case-insensitive volume that name would replace the app's own `Unmark`
executable. Put it on your `PATH` with a symlink, which it resolves to find its
app:

```sh
ln -s /Applications/Unmark.app/Contents/Helpers/unmark /usr/local/bin/unmark
```

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
`scripts/ci/open-documents.swift`. Last, it runs `GIT_EDITOR="unmark --wait" git
commit` in a scratch repo and fails unless git is still running 5 s after the app
reports `COMMIT_EDITMSG` open, then commits the message once `osascript` clicks the
window's close button.

The `main: baseline` ruleset requires the `ci` check (pinned to the GitHub
Actions app) before a pull request can merge, so red builds can't land on
`main`. GitHub lists the check as `ci`; pull requests show it as `CI / ci`.

## License

[MIT](LICENSE)
