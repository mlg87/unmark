.PHONY: bootstrap project build test

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
