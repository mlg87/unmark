// swift-tools-version: 6.0
// Tools version 6.0 builds every target in the Swift 6 language mode.

import PackageDescription

let package = Package(
    name: "UnmarkCore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "UnmarkCore", targets: ["UnmarkCore"]),
    ],
    targets: [
        // Pure logic only: no AppKit or WebKit imports, so `swift test` runs without the app.
        .target(name: "UnmarkCore"),
        .testTarget(name: "UnmarkCoreTests", dependencies: ["UnmarkCore"]),
    ]
)
