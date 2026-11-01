import AppKit
import UnmarkCore

/// Colors the Source's markdown syntax (unmark-1793451436816-25-a00dd960) through text storage attributes, as the
/// text storage's delegate. Colors only, never fonts, so every line keeps the Source font's height.
///
/// Each line's `MarkdownHighlighter.BlockState` rides on its characters as an attribute, so it moves with the text as
/// edits shift it. An edit re-reads the lines around it from the state stored with the first of them, then reads on
/// only while the state the next line starts in differs from the one stored with it: the edit opened or closed a fence
/// or front matter.
final class SourceHighlighting: NSObject, NSTextStorageDelegate {
    /// The state a line starts in, on every character of the line. Absent means `body`.
    private static let blockStateKey = NSAttributedString.Key("com.mlg87.unmark.markdownBlockState")

    /// Asset catalog colors with GitHub's light and dark values, from highlight.js's GitHub themes, which also color
    /// the Preview's code blocks (#17). They're dynamic, so the Source recolors when the appearance changes.
    private let colors: [MarkdownHighlighter.TokenKind: NSColor]

    override init() {
        colors = Dictionary(
            uniqueKeysWithValues: MarkdownHighlighter.TokenKind.allCases.map { kind in
                let name = Self.colorName(kind)
                guard let color = NSColor(named: name) else {
                    preconditionFailure("Assets.xcassets has no color named \(name)")
                }
                return (kind, color)
            })
    }

    /// Changes attributes before the text storage processes the edit, which the delegate may do, so the colors reach
    /// layout with the edit's characters.
    func textStorage(
        _ textStorage: NSTextStorage, willProcessEditing editedMask: NSTextStorageEditActions,
        range editedRange: NSRange,
        changeInLength delta: Int
    ) {
        // Recoloring is an attribute-only edit, as are font changes from zooming.
        guard editedMask.contains(.editedCharacters) else { return }
        let text = textStorage.mutableString
        var lines = MarkdownHighlighter.linesToRehighlight(in: text, editedRange: editedRange)
        var state = lines.location == 0 ? .documentStart : storedState(of: textStorage, at: lines.location)
        // Most fences an edit opens or closes meet the next fence within a few lines, as a closing fence can't have an
        // info string, so reading on starts small. It doubles each pass, so a change that runs to the end of a long
        // document still takes only a few passes.
        var readAhead = 256
        while true {
            let highlight = MarkdownHighlighter.highlight(text, lines: lines, startingIn: state)
            apply(highlight, over: lines, to: textStorage)
            let next = NSMaxRange(lines)
            guard next < text.length, highlight.stateAfter != storedState(of: textStorage, at: next) else { return }
            state = highlight.stateAfter
            lines = MarkdownHighlighter.lineRange(
                in: text, containing: NSRange(location: next, length: min(readAhead, text.length - next)))
            readAhead *= 2
        }
    }

    private func apply(_ highlight: MarkdownHighlighter.Highlight, over lines: NSRange, to textStorage: NSTextStorage) {
        // Each attribute change costs time in proportion to the attribute runs after it, so the few changes that
        // merge runs come first and the many that split them last: this halves highlighting a whole 1 MB document.
        // Typed characters take the attributes of the text before them, the stored state included, so it's reset.
        textStorage.removeAttribute(Self.blockStateKey, range: lines)
        textStorage.addAttribute(.foregroundColor, value: NSColor.textColor, range: lines)
        for run in highlight.lineStates {
            textStorage.addAttribute(Self.blockStateKey, value: run.state, range: run.range)
        }
        for token in highlight.tokens {
            textStorage.addAttribute(
                .foregroundColor, value: colors[token.kind] ?? NSColor.textColor, range: token.range)
        }
    }

    private func storedState(of textStorage: NSTextStorage, at location: Int) -> MarkdownHighlighter.BlockState {
        textStorage.attribute(Self.blockStateKey, at: location, effectiveRange: nil) as? MarkdownHighlighter.BlockState
            ?? .body
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
