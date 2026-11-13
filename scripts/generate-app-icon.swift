// Renders App/Resources/Assets.xcassets/AppIcon.appiconset from the owner's artwork (q58), so every size comes
// from one source and the set can be regenerated whenever the artwork changes.
//
// usage: swift scripts/generate-app-icon.swift
//
// The artwork is full-bleed square art. macOS doesn't mask app icons, so the script applies Apple's macOS icon grid:
// the art fills an 824-point continuous-corner rounded rectangle centered on the 1024-point canvas, over a soft drop
// shadow. An icon off that grid looks out of place in the Dock, and macOS 26 frames such icons in a gray tile.
import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

let repository = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let artworkURL = repository.appendingPathComponent("Artwork/AppIcon.png")
let iconSetURL = repository.appendingPathComponent("App/Resources/Assets.xcassets/AppIcon.appiconset")

/// Apple's macOS app icon grid, in points of the 1024-point canvas.
enum Grid {
    static let canvas: CGFloat = 1024
    static let shape = CGRect(x: 100, y: 100, width: 824, height: 824)
    static let cornerRadius: CGFloat = 185.4
    static let shadowBlur: CGFloat = 28
    static let shadowOffsetY: CGFloat = -12
    static let shadowOpacity: CGFloat = 0.5
}

/// Every image the macOS app icon set holds: each point size at 1x and 2x.
struct IconImage {
    let points: Int
    let scale: Int

    var pixels: Int { points * scale }
    var filename: String { "icon_\(points)x\(points)\(scale == 1 ? "" : "@\(scale)x").png" }
    var contentsEntry: [String: String] {
        ["filename": filename, "idiom": "mac", "scale": "\(scale)x", "size": "\(points)x\(points)"]
    }
}

let images = [16, 32, 128, 256, 512].flatMap { points in [1, 2].map { IconImage(points: points, scale: $0) } }

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("generate-app-icon: \(message)\n".utf8))
    exit(1)
}

func loadArtwork() -> CGImage {
    guard let source = CGImageSourceCreateWithURL(artworkURL as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { fail("can't read \(artworkURL.path)") }
    guard image.width == image.height, image.width >= Int(Grid.canvas) else {
        fail("the artwork must be square and at least 1024 px; got \(image.width)x\(image.height)")
    }
    return image
}

func render(_ artwork: CGImage, pixels: Int) -> CGImage {
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let context = CGContext(
            data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { fail("can't create a \(pixels) px bitmap") }
    context.interpolationQuality = .high
    let scale = CGFloat(pixels) / Grid.canvas
    context.scaleBy(x: scale, y: scale)

    // SwiftUI's continuous corners match the squircle Apple's icon templates use; CGPath only has circular arcs.
    let shape = RoundedRectangle(cornerRadius: Grid.cornerRadius, style: .continuous).path(in: Grid.shape).cgPath

    // Shadow offsets and blur ignore the CTM, so they're scaled by hand.
    context.saveGState()
    context.setShadow(
        offset: CGSize(width: 0, height: Grid.shadowOffsetY * scale), blur: Grid.shadowBlur * scale,
        color: CGColor(gray: 0, alpha: Grid.shadowOpacity))
    context.addPath(shape)
    context.fillPath()
    context.restoreGState()

    context.addPath(shape)
    context.clip()
    context.draw(artwork, in: Grid.shape)

    guard let image = context.makeImage() else { fail("can't render the \(pixels) px image") }
    return image
}

func writePNG(_ image: CGImage, to url: URL) {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { fail("can't write \(url.path)") }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fail("can't write \(url.path)") }
}

let artwork = loadArtwork()
try FileManager.default.createDirectory(at: iconSetURL, withIntermediateDirectories: true)
for image in images {
    writePNG(render(artwork, pixels: image.pixels), to: iconSetURL.appendingPathComponent(image.filename))
}

let contents: [String: Any] = [
    "images": images.map(\.contentsEntry),
    "info": ["author": "xcode", "version": 1],
]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try (json + Data("\n".utf8)).write(to: iconSetURL.appendingPathComponent("Contents.json"))
print("Wrote \(images.count) images to \(iconSetURL.path)")
