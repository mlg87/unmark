import AppKit
import UnmarkCore

/// The colors `SourceHighlighting` gives each token kind: asset catalog colors with light and dark values, so the
/// Source recolors when the appearance changes. Each kind keeps the hue it had from highlight.js's GitHub themes (#17),
/// taken from github.com's current Primer prettylights colors, which the Preview's code blocks also use (unmark-78h).
/// Every color clears WCAG AA's 4.5:1 on the Source's light and dark text backgrounds (unmark-zj9).
///
/// Two departures from github.com: the dark heading takes the constant color #79c0ff, as the Preview's does, because
/// markup-heading #1f6feb is under 4.5:1; and light HTML tags and blockquote markers take markup-inserted #116329
/// instead of entity-tag #0550ae, so they stay green as in dark rather than matching the headings' blue.
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
