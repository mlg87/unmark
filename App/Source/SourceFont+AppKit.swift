import AppKit
import UnmarkCore

extension SourceFont {
    /// `NSFontManager`'s weight for a family's regular face.
    private static let regularWeight = 5

    /// The Source's font in `family`. SF Mono is the system's monospaced font, which `NSFontManager` lists under a
    /// private name, if at all. A family that's no longer installed falls back to it.
    @MainActor
    static func font(family: String, size: Double) -> NSFont {
        guard family != defaultFamily,
            let font = NSFontManager.shared.font(withFamily: family, traits: [], weight: regularWeight, size: size)
        else { return .monospacedSystemFont(ofSize: size, weight: .regular) }
        return font
    }

    /// The installed families with a fixed-pitch face, for Settings' Font popup, SF Mono first.
    @MainActor
    static func installedMonospacedFamilies() -> [String] {
        let fontManager = NSFontManager.shared
        let families = fontManager.availableFontFamilies.filter { family in
            // A leading dot marks the system's private families, such as ".SF NS Mono", which SF Mono already stands
            // for. An installed "SF Mono" is the same font.
            guard !family.hasPrefix("."), family != defaultFamily else { return false }
            // Each member is [PostScript name, style name, weight, traits].
            return (fontManager.availableMembers(ofFontFamily: family) ?? []).contains { member in
                guard member.count > 3, let traits = member[3] as? NSNumber else { return false }
                return NSFontTraitMask(rawValue: traits.uintValue).contains(.fixedPitchFontMask)
            }
        }
        return [defaultFamily] + families
    }
}
