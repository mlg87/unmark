#!/bin/sh
# The Unmark target's first build phase (#22): rebuilds App/Resources/Renderer/ before Xcode copies it into the
# app, so a build never ships a stale renderer. Fails the build when the renderer build fails, including its
# entry-chunk size budgets.
set -eu

# Xcode runs build phases with a minimal PATH, without the Homebrew or nvm installs of Node and pnpm that a
# terminal has. xcodebuild from a shell (CI, `make build`) inherits the shell's PATH and skips both fallbacks.
if ! command -v pnpm >/dev/null 2>&1; then
    PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if ! command -v pnpm >/dev/null 2>&1 && [ -s "$nvm_script" ]; then
    # nvm.sh reads unset variables, and selects the default Node version as it loads.
    set +u
    # shellcheck source=/dev/null
    . "$nvm_script"
    set -u
fi
if ! command -v pnpm >/dev/null 2>&1; then
    echo "error: pnpm not found. Install Node.js 22.12 or later and pnpm (see README)." >&2
    exit 1
fi

cd "$(dirname "$0")/.."
pnpm --dir renderer install --frozen-lockfile
pnpm --dir renderer build
