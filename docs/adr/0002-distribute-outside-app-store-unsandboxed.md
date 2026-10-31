# Distribute outside the Mac App Store, unsandboxed

Unmark ships as a notarized DMG and a Homebrew cask, with Sparkle for updates and App Sandbox disabled. The Preview must load images relative to the document and open relative links to other markdown files. The `unmark` CLI opens arbitrary paths. Under the sandbox, each of these needs security-scoped bookmarks or per-folder user grants. That friction would undercut a viewer whose whole job is to open any markdown file instantly.

## Consequences

- Moving to the Mac App Store later means adopting the sandbox, replacing Sparkle, and reworking file access for relative resources and the CLI.
