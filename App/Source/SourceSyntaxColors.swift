import AppKit
import UnmarkCore

/// The colors `SourceHighlighting` gives each token kind: asset catalog colors with GitHub's light and dark values,
/// from highlight.js's GitHub themes, which also color the Preview's code blocks (#17). They're dynamic, so the Source
/// recolors when the appearance changes.
enum SourceSyntaxColors {
    static func fromAssetCatalog() -> [MarkdownHighlighter.TokenKind: NSColor] {
        Dictionary(
            uniqueKeysWithValues: MarkdownHighlighter.TokenKind.allCases.map { kind in
                let name = colorName(kind)
                guard let color = NSColor(named: name) else {
                    preconditionFailure("Assets.xcassets has no color named \(name)")
                }
                return (kind, color)
            })
    }

    // The switch is exhaustive, so a new token kind doesn't compile until it has a color.
    // swiftlint:disable:next cyclomatic_complexity
    private static func colorName(_ kind: MarkdownHighlighter.TokenKind) -> String {
        switch kind {
        case .heading: "SyntaxHeading"
        case .emphasis: "SyntaxEmphasis"
        case .strong: "SyntaxStrong"
        case .inlineCode: "SyntaxInlineCode"
        case .codeFence: "SyntaxCodeFence"
        case .linkText: "SyntaxLinkText"
        case .linkURL: "SyntaxLinkURL"
        case .listMarker: "SyntaxListMarker"
        case .blockquoteMarker: "SyntaxBlockquoteMarker"
        case .htmlTag: "SyntaxHTMLTag"
        case .frontMatter: "SyntaxFrontMatter"
        }
    }
}
