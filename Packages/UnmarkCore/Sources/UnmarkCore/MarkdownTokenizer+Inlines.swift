/// The inline syntax of one line. Each rule returns the index to read on from, always past `start`.
extension MarkdownTokenizer {
    mutating func inline(_ line: Range<Int>) {
        let end = line.upperBound
        var cursor = line.lowerBound
        while cursor < end {
            switch units[cursor] {
            case .backslash:
                // The escaped character is literal.
                cursor += 2
            case .backtick:
                cursor = codeSpan(at: cursor, lineEnd: end)
            case .lessThan:
                cursor = angleBracket(at: cursor, lineEnd: end)
            case .openBracket:
                cursor = link(from: cursor, bracket: cursor, line: line)
            case .bang where cursor + 1 < end && units[cursor + 1] == .openBracket:
                cursor = link(from: cursor, bracket: cursor + 1, line: line)
            case .star, .underscore:
                cursor = emphasis(at: cursor, lineEnd: end)
            case .lowercaseH:
                cursor = bareURL(at: cursor, lineEnd: end)
            default:
                cursor += 1
            }
        }
    }

    /// A run of backticks closed by a run of the same length. Unclosed, the run is literal.
    private mutating func codeSpan(at start: Int, lineEnd: Int) -> Int {
        if let end = codeSpanEnd(at: start, lineEnd: lineEnd) {
            add(.inlineCode, start..<end)
            return end
        }
        return start + run(of: .backtick, from: start, to: lineEnd)
    }

    private func codeSpanEnd(at start: Int, lineEnd: Int) -> Int? {
        let opening = run(of: .backtick, from: start, to: lineEnd)
        var cursor = start + opening
        while cursor < lineEnd {
            guard units[cursor] == .backtick else {
                cursor += 1
                continue
            }
            let closing = run(of: .backtick, from: cursor, to: lineEnd)
            if closing == opening {
                return cursor + closing
            }
            cursor += closing
        }
        return nil
    }

    /// An autolink such as `<https://example.com>`, an HTML tag, or an HTML comment.
    private mutating func angleBracket(at start: Int, lineEnd end: Int) -> Int {
        if let autolinkEnd = autolinkEnd(at: start, lineEnd: end) {
            add(.linkURL, start..<autolinkEnd)
            return autolinkEnd
        }
        if let tagEnd = commentEnd(at: start, lineEnd: end) ?? tagEnd(at: start, lineEnd: end) {
            add(.htmlTag, start..<tagEnd)
            return tagEnd
        }
        return start + 1
    }

    /// `<`, a scheme of 2 to 32 characters, `:`, then anything but blanks and angle brackets up to `>`.
    private func autolinkEnd(at start: Int, lineEnd end: Int) -> Int? {
        let schemeStart = start + 1
        guard schemeStart < end, units[schemeStart].isASCIILetter else { return nil }
        var cursor = schemeStart + 1
        while cursor < end, cursor - schemeStart < 32,
            units[cursor].isASCIILetter || units[cursor].isDigit || [.plus, .dot, .dash].contains(units[cursor])
        {
            cursor += 1
        }
        guard cursor - schemeStart >= 2, cursor < end, units[cursor] == .colon else { return nil }
        while cursor < end, units[cursor] != .greaterThan, units[cursor] != .lessThan, !units[cursor].isBlank {
            cursor += 1
        }
        return cursor < end && units[cursor] == .greaterThan ? cursor + 1 : nil
    }

    private func commentEnd(at start: Int, lineEnd end: Int) -> Int? {
        let opener: [UInt16] = [.lessThan, .bang, .dash, .dash]
        guard units[start..<end].starts(with: opener) else { return nil }
        var cursor = start + opener.count
        while cursor + 2 < end {
            if units[cursor] == .dash, units[cursor + 1] == .dash, units[cursor + 2] == .greaterThan {
                return cursor + 3
            }
            cursor += 1
        }
        return nil
    }

    /// An opening or closing tag on one line: a letter-led name, then attributes up to `>`. Quoted attribute values
    /// can hold `>`.
    private func tagEnd(at start: Int, lineEnd end: Int) -> Int? {
        var cursor = start + 1
        if cursor < end, units[cursor] == .slash {
            cursor += 1
        }
        guard cursor < end, units[cursor].isASCIILetter else { return nil }
        while cursor < end, units[cursor].isASCIILetter || units[cursor].isDigit || units[cursor] == .dash {
            cursor += 1
        }
        guard cursor < end, [.greaterThan, .slash].contains(units[cursor]) || units[cursor].isBlank else { return nil }
        var quote: UInt16?
        while cursor < end {
            let unit = units[cursor]
            if let open = quote {
                if unit == open {
                    quote = nil
                }
            } else if unit == .doubleQuote || unit == .singleQuote {
                quote = unit
            } else if unit == .greaterThan {
                return cursor + 1
            } else if unit == .lessThan {
                return nil
            }
            cursor += 1
        }
        return nil
    }

    /// `[text](destination)`, `[text][label]`, or a reference definition, `[label]: destination`, at the start of the
    /// line. `start` is the `!` of an image or the `[`. Brackets that aren't a link are literal, and their insides are
    /// read as usual.
    private mutating func link(from start: Int, bracket: Int, line: Range<Int>) -> Int {
        let end = line.upperBound
        guard let textEnd = matching(bracket, close: .closeBracket, lineEnd: end).map({ $0 + 1 }), textEnd < end
        else { return bracket + 1 }
        switch units[textEnd] {
        case .openParenthesis:
            guard let destinationEnd = matching(textEnd, close: .closeParenthesis, lineEnd: end) else { break }
            add(.linkText, start..<textEnd)
            add(.linkURL, textEnd..<destinationEnd + 1)
            return destinationEnd + 1
        case .openBracket:
            guard let labelEnd = matching(textEnd, close: .closeBracket, lineEnd: end) else { break }
            add(.linkText, start..<textEnd)
            add(.linkURL, textEnd..<labelEnd + 1)
            return labelEnd + 1
        case .colon where start == skipBlanks(from: line.lowerBound, to: end):
            add(.linkText, start..<textEnd)
            let destinationStart = skipBlanks(from: textEnd + 1, to: end)
            var destinationEnd = destinationStart
            while destinationEnd < end, !units[destinationEnd].isBlank {
                destinationEnd += 1
            }
            add(.linkURL, destinationStart..<destinationEnd)
            return max(destinationEnd, textEnd + 1)
        default:
            break
        }
        return bracket + 1
    }

    /// The `close` that balances the bracket or parenthesis at `open`, skipping escaped characters.
    private func matching(_ open: Int, close: UInt16, lineEnd: Int) -> Int? {
        let opener = units[open]
        var depth = 0
        var cursor = open
        while cursor < lineEnd {
            let unit = units[cursor]
            if unit == .backslash {
                cursor += 2
                continue
            }
            if unit == opener {
                depth += 1
            } else if unit == close {
                depth -= 1
                if depth == 0 {
                    return cursor
                }
            }
            cursor += 1
        }
        return nil
    }

    /// One `*` or `_` opens emphasis and two or more open strong emphasis. The opener must precede a non-blank and
    /// the closer follow one, and `_` can't touch a word on its outer side. One delimiter closes emphasis and two
    /// close strong, so `*a **b** c*` is one emphasis; three close either. Code spans inside are skipped.
    private mutating func emphasis(at start: Int, lineEnd end: Int) -> Int {
        let delimiter = units[start]
        let opening = run(of: delimiter, from: start, to: end)
        let contentStart = start + opening
        guard contentStart < end, !units[contentStart].isBlank else { return contentStart }
        if delimiter == .underscore, start > 0, units[start - 1].isWordUnit {
            return contentStart
        }
        let isStrong = opening >= 2
        var cursor = contentStart
        while cursor < end {
            let unit = units[cursor]
            if unit == .backslash {
                cursor += 2
                continue
            }
            if unit == .backtick {
                cursor = codeSpanEnd(at: cursor, lineEnd: end) ?? cursor + run(of: .backtick, from: cursor, to: end)
                continue
            }
            guard unit == delimiter else {
                cursor += 1
                continue
            }
            let closing = run(of: delimiter, from: cursor, to: end)
            let closingEnd = cursor + closing
            let fitsOpener = isStrong ? closing >= 2 : closing == 1 || closing >= 3
            let touchesWord = delimiter == .underscore && closingEnd < end && units[closingEnd].isWordUnit
            if fitsOpener, !units[cursor - 1].isBlank, !touchesWord {
                add(isStrong ? .strong : .emphasis, start..<closingEnd)
                return closingEnd
            }
            cursor = closingEnd
        }
        return contentStart
    }

    /// A GitHub autolink: `http://` or `https://` not inside a word, up to a blank or `<`, without trailing
    /// punctuation or a `)` that doesn't close a `(` in the URL.
    private mutating func bareURL(at start: Int, lineEnd end: Int) -> Int {
        let schemes: [[UInt16]] = [Array("https://".utf16), Array("http://".utf16)]
        guard start == 0 || !units[start - 1].isWordUnit,
            let scheme = schemes.first(where: { units[start..<end].starts(with: $0) })
        else { return start + 1 }
        let hostStart = start + scheme.count
        var urlEnd = hostStart
        var opened = 0
        var closed = 0
        while urlEnd < end, !units[urlEnd].isBlank, units[urlEnd] != .lessThan {
            if units[urlEnd] == .openParenthesis {
                opened += 1
            } else if units[urlEnd] == .closeParenthesis {
                closed += 1
            }
            urlEnd += 1
        }
        let trailing = Array(".,:;!?'\"*_~".utf16)
        while urlEnd > hostStart {
            let last = units[urlEnd - 1]
            if trailing.contains(last) {
                urlEnd -= 1
            } else if last == .closeParenthesis, closed > opened {
                closed -= 1
                urlEnd -= 1
            } else {
                break
            }
        }
        guard urlEnd > hostStart else { return hostStart }
        add(.linkURL, start..<urlEnd)
        return urlEnd
    }
}
