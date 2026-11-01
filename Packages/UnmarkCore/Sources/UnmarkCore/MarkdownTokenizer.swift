import Foundation

/// UTF-16 code units the tokenizer matches.
extension UInt16 {
    static let lineFeed: UInt16 = 0x0A
    static let carriageReturn: UInt16 = 0x0D
    static let space: UInt16 = 0x20
    static let tab: UInt16 = 0x09
    static let bang: UInt16 = 0x21
    static let doubleQuote: UInt16 = 0x22
    static let hash: UInt16 = 0x23
    static let singleQuote: UInt16 = 0x27
    static let openParenthesis: UInt16 = 0x28
    static let closeParenthesis: UInt16 = 0x29
    static let star: UInt16 = 0x2A
    static let plus: UInt16 = 0x2B
    static let dash: UInt16 = 0x2D
    static let dot: UInt16 = 0x2E
    static let slash: UInt16 = 0x2F
    static let colon: UInt16 = 0x3A
    static let lessThan: UInt16 = 0x3C
    static let greaterThan: UInt16 = 0x3E
    static let openBracket: UInt16 = 0x5B
    static let backslash: UInt16 = 0x5C
    static let closeBracket: UInt16 = 0x5D
    static let underscore: UInt16 = 0x5F
    static let backtick: UInt16 = 0x60
    static let lowercaseH: UInt16 = 0x68
    static let tilde: UInt16 = 0x7E

    var isLineBreak: Bool { self == .lineFeed || self == .carriageReturn }
    var isBlank: Bool { self == .space || self == .tab }
    var isDigit: Bool { (0x30...0x39).contains(self) }
    var isASCIILetter: Bool { (0x41...0x5A).contains(self) || (0x61...0x7A).contains(self) }

    /// Letters and digits in any script, for the rule that `_` doesn't open or close emphasis inside a word. Anything
    /// outside ASCII except a no-break space counts, which is right for letters and close enough for the rest.
    var isWordUnit: Bool { isASCIILetter || isDigit || (self >= 0x80 && self != 0xA0) }
}

/// Reads whole lines for `MarkdownHighlighter`: the block structure here, and the inlines of each line in
/// MarkdownTokenizer+Inlines.swift.
struct MarkdownTokenizer {
    /// A fenced code block or front matter being read, which becomes one token when it closes or the lines run out.
    private struct OpenBlock {
        let kind: MarkdownHighlighter.TokenKind
        let start: Int
        var end: Int
    }

    let units: [UInt16]
    /// Where `units` starts in the document, added to every range the tokenizer reports.
    let base: Int
    private(set) var tokens: [MarkdownHighlighter.Token] = []
    private(set) var lineStates: [MarkdownHighlighter.LineStates] = []
    private var block: OpenBlock?

    init(units: [UInt16], base: Int) {
        self.units = units
        self.base = base
    }

    mutating func read(startingIn initial: MarkdownHighlighter.BlockState) -> MarkdownHighlighter.BlockState {
        var state = initial
        var lineStart = 0
        while lineStart < units.count {
            var contentEnd = lineStart
            while contentEnd < units.count, !units[contentEnd].isLineBreak {
                contentEnd += 1
            }
            var next = contentEnd
            if next < units.count {
                let isCRLF = units[next] == .carriageReturn && next + 1 < units.count && units[next + 1] == .lineFeed
                next += isCRLF ? 2 : 1
            }
            record(state, lines: lineStart..<next)
            state = read(line: lineStart..<contentEnd, startingIn: state)
            lineStart = next
        }
        closeBlock()
        return state
    }

    // MARK: Blocks

    private mutating func read(
        line: Range<Int>, startingIn state: MarkdownHighlighter.BlockState
    ) -> MarkdownHighlighter.BlockState {
        switch state {
        case .fence(let marker, let length):
            extendBlock(.codeFence, over: line)
            guard closesFence(line, marker: marker == "~" ? .tilde : .backtick, length: length) else { return state }
            closeBlock()
            return .body
        case .frontMatter(let markers):
            extendBlock(.frontMatter, over: line)
            guard closesFrontMatter(line, markers: markers) else { return state }
            closeBlock()
            return .body
        case .documentStart:
            // markdown-it-front-matter, the renderer's plugin, opens on three or more dashes at the very start of
            // the document, whatever follows them on the line, and closes at the end of the document if nothing
            // closes it sooner.
            let markers = run(of: .dash, from: line.lowerBound, to: line.upperBound)
            guard markers >= 3 else { return bodyLine(line) }
            extendBlock(.frontMatter, over: line)
            return .frontMatter(markers: markers)
        case .body:
            return bodyLine(line)
        }
    }

    private mutating func bodyLine(_ line: Range<Int>) -> MarkdownHighlighter.BlockState {
        let end = line.upperBound
        var cursor = line.lowerBound
        // Containers: blockquote markers and list-item bullets, in any order and nesting.
        while true {
            cursor = skipBlanks(from: cursor, to: end)
            guard cursor < end else { return .body }
            if units[cursor] == .greaterThan {
                add(.blockquoteMarker, cursor..<cursor + 1)
                cursor += 1
            } else if let bulletEnd = bulletEnd(at: cursor, lineEnd: end) {
                add(.listMarker, cursor..<bulletEnd)
                cursor = bulletEnd
            } else {
                break
            }
        }
        let hashes = run(of: .hash, from: cursor, to: end)
        if (1...6).contains(hashes), cursor + hashes == end || units[cursor + hashes].isBlank {
            add(.heading, cursor..<end)
            return .body
        }
        if let fence = openingFence(at: cursor, lineEnd: end) {
            extendBlock(.codeFence, over: cursor..<end)
            return fence
        }
        inline(cursor..<end)
        return .body
    }

    /// A fence of three or more backticks or tildes. A backtick fence's info string can't contain a backtick.
    private func openingFence(at start: Int, lineEnd end: Int) -> MarkdownHighlighter.BlockState? {
        guard start < end, units[start] == .backtick || units[start] == .tilde else { return nil }
        let marker = units[start]
        let length = run(of: marker, from: start, to: end)
        guard length >= 3 else { return nil }
        if marker == .backtick, units[(start + length)..<end].contains(.backtick) {
            return nil
        }
        return .fence(marker: marker == .tilde ? "~" : "`", length: length)
    }

    /// At least `length` of the opening fence's character, after any indent or blockquote markers, then only blanks.
    private func closesFence(_ line: Range<Int>, marker: UInt16, length: Int) -> Bool {
        var cursor = line.lowerBound
        while cursor < line.upperBound, units[cursor].isBlank || units[cursor] == .greaterThan {
            cursor += 1
        }
        let count = run(of: marker, from: cursor, to: line.upperBound)
        return count >= length && skipBlanks(from: cursor + count, to: line.upperBound) == line.upperBound
    }

    /// At least `markers` dashes, indented less than four spaces, then only blanks, as markdown-it-front-matter reads
    /// it.
    private func closesFrontMatter(_ line: Range<Int>, markers: Int) -> Bool {
        let cursor = skipBlanks(from: line.lowerBound, to: line.upperBound)
        guard cursor - line.lowerBound < 4 else { return false }
        let count = run(of: .dash, from: cursor, to: line.upperBound)
        return count >= markers && skipBlanks(from: cursor + count, to: line.upperBound) == line.upperBound
    }

    /// The index after a list-item bullet (`-`, `*`, `+`, or up to nine digits and `.` or `)`), which a blank or the
    /// end of the line must follow, or nil when there's none at `start`.
    private func bulletEnd(at start: Int, lineEnd: Int) -> Int? {
        var end = start
        switch units[start] {
        case .dash, .star, .plus:
            end += 1
        case _ where units[start].isDigit:
            while end < lineEnd, units[end].isDigit, end - start < 9 {
                end += 1
            }
            guard end < lineEnd, units[end] == .dot || units[end] == .closeParenthesis else { return nil }
            end += 1
        default:
            return nil
        }
        guard end == lineEnd || units[end].isBlank else { return nil }
        return end
    }

    // MARK: Output

    mutating func add(_ kind: MarkdownHighlighter.TokenKind, _ range: Range<Int>) {
        guard !range.isEmpty else { return }
        tokens.append(MarkdownHighlighter.Token(range: nsRange(range), kind: kind))
    }

    private mutating func extendBlock(_ kind: MarkdownHighlighter.TokenKind, over line: Range<Int>) {
        if block == nil {
            block = OpenBlock(kind: kind, start: line.lowerBound, end: line.upperBound)
        } else {
            block?.end = line.upperBound
        }
    }

    private mutating func closeBlock() {
        if let block {
            add(block.kind, block.start..<block.end)
        }
        block = nil
    }

    private mutating func record(_ state: MarkdownHighlighter.BlockState, lines: Range<Int>) {
        guard state != .body else { return }
        if let last = lineStates.last, last.state == state, NSMaxRange(last.range) == base + lines.lowerBound {
            lineStates[lineStates.count - 1] = MarkdownHighlighter.LineStates(
                range: NSRange(location: last.range.location, length: last.range.length + lines.count), state: state)
        } else {
            lineStates.append(MarkdownHighlighter.LineStates(range: nsRange(lines), state: state))
        }
    }

    private func nsRange(_ range: Range<Int>) -> NSRange {
        NSRange(location: base + range.lowerBound, length: range.count)
    }

    // MARK: Scanning

    func run(of unit: UInt16, from start: Int, to end: Int) -> Int {
        var cursor = start
        while cursor < end, units[cursor] == unit {
            cursor += 1
        }
        return cursor - start
    }

    func skipBlanks(from start: Int, to end: Int) -> Int {
        var cursor = start
        while cursor < end, units[cursor].isBlank {
            cursor += 1
        }
        return cursor
    }
}
