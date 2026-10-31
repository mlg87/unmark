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
| `project.yml` | XcodeGen spec for the `Unmark` app target |
| `App/` | AppKit app target (`NSDocument`, SwiftUI window content, ADR-0003); resources in `App/Resources/`. `App/Info.plist` is generated from `project.yml` |
| `App/Preview/` | The Preview: a WKWebView that loads the renderer and the document's files from the `unmark://app/` scheme |
| `Packages/UnmarkCore/` | Swift package with pure, unit-tested logic (no AppKit or WebKit) |
| `renderer/` | pnpm package that bundles the markdown renderer into `App/Resources/Renderer/` |
| `renderer/patches/` | `pnpm patch` fixes to dependencies, applied by `pnpm install` |
| `scripts/` | Build and release scripts |
| `docs/fixtures/` | Markdown documents for checking the Preview by hand, e.g. `kitchen-sink.md` |

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`
on a `macos-15` runner with Xcode 16.4. A single job, `ci`, runs `make lint`, the
renderer tests, the renderer build (which fails if a dependency exceeds its
entry-chunk size budget in `renderer/build.mjs`), `make test`, and an ad-hoc signed
universal Release build, then fails unless `lipo -archs` reports both `x86_64` and
`arm64`.

The `main: baseline` ruleset requires the `ci` check (pinned to the GitHub
Actions app) before a pull request can merge, so red builds can't land on
`main`. GitHub lists the check as `ci`; pull requests show it as `CI / ci`.

## License

[MIT](LICENSE)
