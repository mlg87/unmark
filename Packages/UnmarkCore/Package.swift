// swift-tools-version: 6.0
// Tools version 6.0 builds every target in the Swift 6 language mode.

import PackageDescription

let package = Package(
    name: "UnmarkCore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "UnmarkCore", targets: ["UnmarkCore"]),
        .library(name: "UnmarkAppKit", targets: ["UnmarkAppKit"]),
    ],
    targets: [
        // Pure logic only: no AppKit or WebKit imports, so `swift test` runs without the app.
        .target(name: "UnmarkCore"),
        .testTarget(name: "UnmarkCoreTests", dependencies: ["UnmarkCore"]),
        // The app's AppKit pieces that only behave right inside a real text view, so `swift test` can drive one
        // (#159). The CLI links only UnmarkCore, so it doesn't load AppKit.
        .target(name: "UnmarkAppKit", dependencies: ["UnmarkCore"]),
        .testTarget(name: "UnmarkAppKitTests", dependencies: ["UnmarkAppKit", "UnmarkCore"]),
    ]
)
