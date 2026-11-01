import Foundation

/// Finds the markdown syntax the Source colors (unmark-1793451436816-25-a00dd960). It reads whole lines and carries
/// only a `BlockState` from one line to the next, so after an edit the Source re-reads the lines the edit touched and
/// reads on only while the state the following line starts in changed, which happens when the edit opened or closed a
/// fenced code block or front matter. Lines break where markdown-it breaks them, as `SourceLines` does, and ranges
/// count UTF-16 code units, as NSString and NSTextView do.
///
/// It colors rather than parses: each inline rule reads one line, so emphasis or a link that wraps onto the next line
/// stays uncolored, and syntax nested in a token takes that token's color.
public enum MarkdownHighlighter {
    public enum TokenKind: CaseIterable, Sendable {
        /// An ATX heading, from its `#` to the end of the line.
        case heading
        case emphasis
        case strong
        case inlineCode
        /// A whole fenced code block, from the opening fence through the closing one.
        case codeFence
        /// A link's or image's bracketed text, or the label of a reference definition.
        case linkText
        /// A link's destination or reference label, an autolink, or a bare http(s) URL.
        case linkURL
        case listMarker
        case blockquoteMarker
        /// An HTML tag or comment.
        case htmlTag
        /// YAML front matter, delimiters included.
        case frontMatter
    }

    public struct Token: Equatable, Sendable {
        public let range: NSRange
        public let kind: TokenKind

        public init(range: NSRange, kind: TokenKind) {
            self.range = range
            self.kind = kind
        }
    }

    /// What a line inherits from the lines above it.
    public enum BlockState: Hashable, Sendable {
        /// The first line of the document, the only one that can open front matter.
        case documentStart
        case body
        /// Inside front matter opened by `markers` dashes. A line of at least as many closes it.
        case frontMatter(markers: Int)
        /// Inside a fenced code block opened by `length` backticks or tildes. A fence of at least as many closes it.
        case fence(marker: Character, length: Int)
    }

    /// A run of whole lines, line breaks included, that start in `state`.
    public struct LineStates: Equatable, Sendable {
        public let range: NSRange
        public let state: BlockState

        public init(range: NSRange, state: BlockState) {
            self.range = range
            self.state = state
        }
    }

    public struct Highlight: Equatable, Sendable {
        /// In document order, without overlaps.
        public var tokens: [Token]
        /// The state each line starts in, except lines that start in `body`, which are most of them.
        public var lineStates: [LineStates]
        /// The state the line after the last one read starts in.
        public var stateAfter: BlockState
    }

    /// The tokens of a whole document.
    public static func tokens(in text: String) -> [Token] {
        let text = text as NSString
        return highlight(text, lines: NSRange(location: 0, length: text.length), startingIn: .documentStart).tokens
    }

    /// Reads `lines`, whole lines of `text` such as `lineRange(in:containing:)` returns, whose first line starts in
    /// `state`. The document's first line starts in `documentStart`.
    public static func highlight(_ text: NSString, lines: NSRange, startingIn state: BlockState) -> Highlight {
        var units = [UInt16](repeating: 0, count: lines.length)
        text.getCharacters(&units, range: lines)
        var tokenizer = MarkdownTokenizer(units: units, base: lines.location)
        let stateAfter = tokenizer.read(startingIn: state)
        return Highlight(tokens: tokenizer.tokens, lineStates: tokenizer.lineStates, stateAfter: stateAfter)
    }

    /// The whole lines containing `range`, line breaks included. An empty range names the line it's on.
    public static func lineRange(in text: NSString, containing range: NSRange) -> NSRange {
        let length = text.length
        var start = min(range.location, length)
        // A range starting between "\r" and "\n" starts on the line they end.
        if start > 0, start < length, text.character(at: start - 1) == .carriageReturn,
            text.character(at: start) == .lineFeed
        {
            start -= 1
        }
        while start > 0, !text.character(at: start - 1).isLineBreak {
            start -= 1
        }
        var end = min(NSMaxRange(range), length)
        if range.length == 0 || !text.character(at: end - 1).isLineBreak {
            while end < length, !text.character(at: end).isLineBreak {
                end += 1
            }
            if end < length {
                end += 1
            }
        }
        if end > 0, end < length, text.character(at: end - 1) == .carriageReturn, text.character(at: end) == .lineFeed {
            end += 1
        }
        return NSRange(location: start, length: end - start)
    }

    /// The lines to re-read after `editedRange` of `text` changed: the lines it touched, plus the line before and the
    /// line after. The extra lines make both ends of the result characters the edit didn't touch, so the state the
    /// Source stored with them is still the state their lines start in, even when the edit added or removed a line
    /// break at either end.
    public static func linesToRehighlight(in text: NSString, editedRange: NSRange) -> NSRange {
        let start = max(editedRange.location - 1, 0)
        let end = min(NSMaxRange(editedRange) + 1, text.length)
        return lineRange(in: text, containing: NSRange(location: start, length: max(end - start, 0)))
    }
}
