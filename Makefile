.PHONY: bootstrap project build test lint format

DERIVED_DATA := build/DerivedData
APP := $(DERIVED_DATA)/Build/Products/Release/Unmark.app

bootstrap:
	brew bundle --file=Brewfile

project:
	xcodegen generate

# Regenerates first so files added since the last `make project` are always compiled.
build: project
	xcodebuild -project Unmark.xcodeproj -scheme Unmark -configuration Release \
		-destination 'generic/platform=macOS' -derivedDataPath $(DERIVED_DATA) build
	@echo "Built $(APP)"

test:
	swift test --package-path Packages/UnmarkCore

SWIFT_SOURCES := App Packages

# One entry point for every linter, run after each change (AGENTS.md conventions).
# Warnings fail the build in every tool (-s, --strict, --error-on-warnings) so they can't pile up.
lint:
	swift format lint -s -r $(SWIFT_SOURCES)
	swiftlint lint --strict --quiet
	pnpm --dir renderer exec biome check --error-on-warnings .

format:
	swift format format -i -r $(SWIFT_SOURCES)
	swiftlint lint --fix --quiet
	pnpm --dir renderer exec biome check --write .
