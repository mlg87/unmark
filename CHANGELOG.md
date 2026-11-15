# Changelog

Each release's notes, newest first. The Release PR workflow adds them from GitHub's generated notes, and the release PR is the place to edit them: the GitHub release and Sparkle's update dialog show this file's section as merged. See [docs/releasing.md](docs/releasing.md).

## v0.2.0 (2026-11-15)

### What's Changed
* docs(screenshots): show every rich element the Preview renders in sample.md by @mlg87 in https://github.com/mlg87/unmark/pull/173
* chore: ignore macOS .DS_Store files by @mlg87 in https://github.com/mlg87/unmark/pull/176
* docs(screenshots): retake the README screenshots of the expanded sample.md by @mlg87 in https://github.com/mlg87/unmark/pull/197
* feat(site): scaffold the Vite, React, and TypeScript marketing site (unmark-2rg.1) by @mlg87 in https://github.com/mlg87/unmark/pull/198
* Add the Poster design system and the scroll-scene shell (unmark-2rg.2) by @mlg87 in https://github.com/mlg87/unmark/pull/200
* feat(artwork): add 3D renders of the # mark with transparent backgrounds (unmark-2rg.13) by @mlg87 in https://github.com/mlg87/unmark/pull/201
* Clear sheet styles when switching from pinned to static (unmark-2rg.17) by @mlg87 in https://github.com/mlg87/unmark/pull/203
* feat(site): host unmarkeditor.com on a private S3 bucket behind CloudFront's Free plan (unmark-iw4.2) by @mlg87 in https://github.com/mlg87/unmark/pull/204
* feat(site): deploy unmarkeditor.com from GitHub Actions through OIDC (unmark-iw4.3) by @mlg87 in https://github.com/mlg87/unmark/pull/205
* feat(site): Source to Preview scene, raw markdown un-marks into the rendered page (unmark-2rg.4) by @mlg87 in https://github.com/mlg87/unmark/pull/206
* feat(site): hero scene with download actions and a window that tilts flat (unmark-2rg.3) by @mlg87 in https://github.com/mlg87/unmark/pull/207
* fix(site): trust the repository's immutable OIDC subject in the deploy role (unmark-iw4.3) by @mlg87 in https://github.com/mlg87/unmark/pull/208
* fix(site): keep the Unmark card's title out of the page's <h1>s (unmark-2rg.18) by @mlg87 in https://github.com/mlg87/unmark/pull/215
* feat(site): page metadata, social card, favicons, and sitemap (unmark-2rg.11) by @mlg87 in https://github.com/mlg87/unmark/pull/217
* feat(site): terminal scene, commands type themselves as you scroll (unmark-2rg.8) by @mlg87 in https://github.com/mlg87/unmark/pull/213
* feat(site): Outline and Find scene, zoom to the Outline and step through its headings (unmark-2rg.7) by @mlg87 in https://github.com/mlg87/unmark/pull/212
* feat(site): Split mode scene, the window opens from the Preview to Source and Preview (unmark-2rg.6) by @mlg87 in https://github.com/mlg87/unmark/pull/211
* feat(site): Renders like GitHub scene, a gallery that slides sideways (unmark-2rg.5) by @mlg87 in https://github.com/mlg87/unmark/pull/209
* feat(site): light and dark scene, a diagonal wipe between the two appearances (unmark-2rg.9) by @mlg87 in https://github.com/mlg87/unmark/pull/214
* feat(site): install section, footer, floating download button, and 404 page (unmark-2rg.10) by @mlg87 in https://github.com/mlg87/unmark/pull/216
* feat(site): the 3D # mark as the recurring poster graphic (unmark-2rg.14) by @mlg87 in https://github.com/mlg87/unmark/pull/219
* feat(site): accessibility and performance pass, with Lighthouse in CI (unmark-2rg.12) by @mlg87 in https://github.com/mlg87/unmark/pull/220
* docs: link the README to unmarkeditor.com (unmark-2rg.15) by @mlg87 in https://github.com/mlg87/unmark/pull/222
* fix(renderer): code colors from github.com's current palette, all at 4.5:1 or better (unmark-78h) by @mlg87 in https://github.com/mlg87/unmark/pull/224
* fix(source): syntax colors from github.com's current palette, all at 4.5:1 or better (unmark-zj9) by @mlg87 in https://github.com/mlg87/unmark/pull/225
* Use GitHub's rich markdown elements in the README by @mlg87 in https://github.com/mlg87/unmark/pull/227
* feat(skills): unmark-docs skill with format and rendering checks (unmark-c6y.1) by @mlg87 in https://github.com/mlg87/unmark/pull/242
* feat(skills): unmark-meeting-docs skill for agendas, recaps, and 1:1 documents (unmark-c6y.4) by @mlg87 in https://github.com/mlg87/unmark/pull/244
* feat(skills): unmark-planning-docs skill for requirements, ADRs, and project plans (unmark-c6y.5) by @mlg87 in https://github.com/mlg87/unmark/pull/245
* feat(skills): unmark-polish skill that improves a document without changing what it says (unmark-c6y.2) by @mlg87 in https://github.com/mlg87/unmark/pull/246
* fix(skills): one-line description check and OLD_KEY_ID step in the unmark-docs example (unmark-c6y.7) by @mlg87 in https://github.com/mlg87/unmark/pull/247
* feat(skills): ship skills/ inside Unmark.app and add SkillInstall (unmark-bhp.1) by @mlg87 in https://github.com/mlg87/unmark/pull/248
* feat(skills): unmark-api-docs skill for REST, GraphQL, and SDK references (unmark-c6y.3) by @mlg87 in https://github.com/mlg87/unmark/pull/249
* feat(cli): unmark --install-skills and --uninstall-skills (unmark-bhp.2) by @mlg87 in https://github.com/mlg87/unmark/pull/251
* docs(skills): check the five skills in Claude Code (unmark-c6y.6) by @mlg87 in https://github.com/mlg87/unmark/pull/253
* feat(settings): Agent Skills section installs and removes the skills (unmark-bhp.3) by @mlg87 in https://github.com/mlg87/unmark/pull/252
* fix(skills): collision-free GraphQL operation and type headings (unmark-c6y.8) by @mlg87 in https://github.com/mlg87/unmark/pull/254


**Full Changelog**: https://github.com/mlg87/unmark/compare/v0.1.0...v0.2.0

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
