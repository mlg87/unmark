# unmark

## Development setup

Requirements:

- macOS 14 or later with Xcode 16.4 or later
- [Homebrew](https://brew.sh)
- Node.js 22.12 or later and [pnpm](https://pnpm.io) (for the `renderer/` package)

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
| `App/` | SwiftUI app target; resources in `App/Resources/` |
| `Packages/UnmarkCore/` | Swift package with pure, unit-tested logic (no AppKit or WebKit) |
| `renderer/` | pnpm package that bundles the markdown renderer into `App/Resources/Renderer/` |
| `scripts/` | Build and release scripts (added with the release work) |

## License

[MIT](LICENSE)
