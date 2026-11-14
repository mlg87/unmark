# Changelog

Each release's notes, newest first. The Release PR workflow adds them from GitHub's generated notes, and the release PR is the place to edit them: the GitHub release and Sparkle's update dialog show this file's section as merged. See [docs/releasing.md](docs/releasing.md).

## v0.1.0 (2026-11-14)

### What's Changed
* test(renderer): run the keystroke-to-preview timing test alone after the other files (unmark-t5a) by @mlg87 in https://github.com/mlg87/unmark/pull/147
* Add logo image to README by @mlg87 in https://github.com/mlg87/unmark/pull/149
* feat(release): Embed GitHub-generated release notes in the Sparkle appcast (unmark-1793451429404-9-dd0cf149.1) by @mlg87 in https://github.com/mlg87/unmark/pull/150
* feat(release): Homebrew cask in mlg87/homebrew-tap, bumped on every v* tag (unmark-1793451445649-44-8803ca5d) by @mlg87 in https://github.com/mlg87/unmark/pull/151
* docs(readme): user-facing install, usage, command line, and Settings (unmark-1793451446109-45-43027e5f) by @mlg87 in https://github.com/mlg87/unmark/pull/152
* docs(readme): ⌘E works only in the Source (unmark-1793451429404-9-dd0cf149.3) by @mlg87 in https://github.com/mlg87/unmark/pull/154
* docs(agents): take Closes #N from the bead's external_ref and confirm the issue closes by @mlg87 in https://github.com/mlg87/unmark/pull/157
* test(renderer): hold the fastest of three rounds' first keystrokes to 2x the median (unmark-njf) by @mlg87 in https://github.com/mlg87/unmark/pull/158
* fix(source): keep the caret in place when editing mid-line (unmark-1uk) by @mlg87 in https://github.com/mlg87/unmark/pull/160
* test(renderer): give the 400-section replacement tests a 30 s timeout (unmark-r3k) by @mlg87 in https://github.com/mlg87/unmark/pull/162
* ci: run independent checks in parallel jobs (unmark-4ma) by @mlg87 in https://github.com/mlg87/unmark/pull/164
* feat(release): Release PR workflow writes CHANGELOG.md and opens a release PR; merging it tags and publishes (unmark-1793451429404-9-dd0cf149.4) by @mlg87 in https://github.com/mlg87/unmark/pull/166
* fix(release): approve the release PR's held CI run instead of dispatching CI (unmark-1793451429404-9-dd0cf149.5) by @mlg87 in https://github.com/mlg87/unmark/pull/169
* fix(release): refuse to tag a stale release PR and strip the generated-notes comment (unmark-1793451429404-9-dd0cf149.6) by @mlg87 in https://github.com/mlg87/unmark/pull/171


**Full Changelog**: https://github.com/mlg87/unmark/compare/v0.0.1-rc1...v0.1.0
