import Foundation
import Testing
import UnmarkCore

struct MarkdownHighlighterTests {
    typealias Token = MarkdownHighlighter.Token

    /// Every token kind, with a fenced block that opens partway down the document.
    static let fixture = """
        ---
        title: Fixture
        ---
        # Heading with *stars*
        Text with *emphasis*, __strong__, `code`, and [a link](https://example.com).
        - item with <kbd>key</kbd> and ![alt](image.png)
        1. see <https://example.org> and [ref][label]
        > quoted
        <!-- comment -->

        Visit https://github.com/mlg87/unmark.
        ```swift
        let x = **not strong**
        ```
        After the fence, *emphasis* again.
        [label]: https://example.net "Title"
        """

    @Test func findsEveryTokenKind() {
        let expected: [(String, MarkdownHighlighter.TokenKind)] = [
            ("---\ntitle: Fixture\n---", .frontMatter),
            ("# Heading with *stars*", .heading),
            ("*emphasis*", .emphasis),
            ("__strong__", .strong),
            ("`code`", .inlineCode),
            ("[a link]", .linkText),
            ("(https://example.com)", .linkURL),
            ("-", .listMarker),
            ("<kbd>", .htmlTag),
            ("</kbd>", .htmlTag),
            ("![alt]", .linkText),
            ("(image.png)", .linkURL),
            ("1.", .listMarker),
            ("<https://example.org>", .linkURL),
            ("[ref]", .linkText),
            ("[label]", .linkURL),
            (">", .blockquoteMarker),
            ("<!-- comment -->", .htmlTag),
            ("https://github.com/mlg87/unmark", .linkURL),
            ("```swift\nlet x = **not strong**\n```", .codeFence),
            ("*emphasis*", .emphasis),
            ("[label]", .linkText),
            ("https://example.net", .linkURL),
        ]
        #expect(MarkdownHighlighter.tokens(in: Self.fixture) == tokens(expected, in: Self.fixture))
        #expect(Set(expected.map(\.1)) == Set(MarkdownHighlighter.TokenKind.allCases))
    }

    @Test func aFenceOpenedPartwayDownColorsTheLinesBelowUntilItCloses() {
        let text = "a *b*\n```\n*c*\n``\n*d*\n````\n*e*" as NSString
        let all = NSRange(location: 0, length: text.length)
        let tokens = MarkdownHighlighter.highlight(text, lines: all, startingIn: .documentStart).tokens
        #expect(
            tokens
                == self.tokens(
                    [("*b*", .emphasis), ("```\n*c*\n``\n*d*\n````", .codeFence), ("*e*", .emphasis)],
                    in: text as String))
    }

    @Test func aShorterOrDifferentFenceDoesNotClose() {
        let highlight = MarkdownHighlighter.highlight(
            "~~~~\n```\n~~~\n" as NSString, lines: NSRange(location: 0, length: 13), startingIn: .body)
        #expect(highlight.stateAfter == .fence(marker: "~", length: 4))
        #expect(highlight.tokens == [Token(range: NSRange(location: 0, length: 12), kind: .codeFence)])
    }

    @Test func aBacktickInTheInfoStringMakesInlineCodeNotAFence() {
        let highlight = MarkdownHighlighter.highlight(
            "```a`b```" as NSString, lines: NSRange(location: 0, length: 9), startingIn: .body)
        #expect(highlight.stateAfter == .body)
        #expect(highlight.tokens.map(\.kind) == [.inlineCode])
    }

    @Test func frontMatterOpensOnlyOnTheFirstLine() {
        #expect(MarkdownHighlighter.tokens(in: "\n---\na: b\n---").map(\.kind).contains(.frontMatter) == false)
        // Like markdown-it-front-matter, unclosed front matter runs to the end of the document.
        #expect(
            MarkdownHighlighter.tokens(in: "---\na: *b*\n") == [
                Token(range: NSRange(location: 0, length: 10), kind: .frontMatter)
            ])
    }

    @Test(arguments: [
        "snake_case_name",
        "2 * 3 * 4",
        "* not emphasis",
        "**unclosed",
        "\\*escaped\\*",
        "- [ ] a task, not a link",
    ])
    func plainTextHasNoEmphasisOrLink(line: String) {
        let kinds = MarkdownHighlighter.tokens(in: line).map(\.kind)
        #expect(!kinds.contains(.emphasis) && !kinds.contains(.strong) && !kinds.contains(.linkText))
    }

    @Test func emphasisSpansNestedStrong() {
        #expect(
            MarkdownHighlighter.tokens(in: "*a **b** c*") == [
                Token(range: NSRange(location: 0, length: 11), kind: .emphasis)
            ])
    }

    /// The Source re-reads any line starting from the state recorded for it, so doing that must give what reading the
    /// whole document does.
    @Test func rereadingFromARecordedStateMatchesReadingTheWholeDocument() {
        let text = Self.fixture as NSString
        let all = NSRange(location: 0, length: text.length)
        let whole = MarkdownHighlighter.highlight(text, lines: all, startingIn: .documentStart)
        for run in whole.lineStates {
            let rest = NSRange(location: run.range.location, length: NSMaxRange(all) - run.range.location)
            let reread = MarkdownHighlighter.highlight(text, lines: rest, startingIn: run.state)
            #expect(reread.stateAfter == whole.stateAfter)
            #expect(reread.tokens.last == whole.tokens.last)
            #expect(reread.lineStates.first?.state == run.state)
            #expect(
                reread.lineStates.dropFirst()
                    == whole.lineStates.drop(while: { $0.range.location <= run.range.location }))
        }
    }

    @Test func recordsTheStateOfEachLineThatDoesNotStartInBody() {
        let text = "x\n```\ny\r\n```\nz" as NSString
        let highlight = MarkdownHighlighter.highlight(
            text, lines: NSRange(location: 2, length: text.length - 2), startingIn: .body)
        #expect(
            highlight.lineStates == [
                MarkdownHighlighter.LineStates(
                    range: NSRange(location: 6, length: 7), state: .fence(marker: "`", length: 3))
            ])
        #expect(highlight.stateAfter == .body)
    }

    @Test(arguments: [
        (NSRange(location: 1, length: 0), NSRange(location: 0, length: 4)),
        // Between "\r" and "\n".
        (NSRange(location: 3, length: 0), NSRange(location: 0, length: 4)),
        (NSRange(location: 5, length: 3), NSRange(location: 4, length: 6)),
        // The end of the text.
        (NSRange(location: 12, length: 0), NSRange(location: 10, length: 2)),
    ])
    func lineRangeTakesWholeLinesAndKeepsCRLFTogether(range: NSRange, lines: NSRange) {
        #expect(MarkdownHighlighter.lineRange(in: "ab\r\ncd\ref\ngh", containing: range) == lines)
    }

    @Test(arguments: [
        // "b\n" was just typed: the lines of "a" and "c" come along.
        (NSRange(location: 2, length: 2), NSRange(location: 0, length: 6)),
        // A deletion at the start of "c" takes the line of "b" along.
        (NSRange(location: 4, length: 0), NSRange(location: 2, length: 4)),
        (NSRange(location: 0, length: 0), NSRange(location: 0, length: 2)),
        (NSRange(location: 7, length: 0), NSRange(location: 6, length: 1)),
    ])
    func linesToRehighlightIncludeTheLinesAroundTheEdit(editedRange: NSRange, lines: NSRange) {
        #expect(MarkdownHighlighter.linesToRehighlight(in: "a\nb\nc\nd", editedRange: editedRange) == lines)
    }

    /// Tokens for `expected`, each found in `text` after the one before it.
    private func tokens(_ expected: [(String, MarkdownHighlighter.TokenKind)], in text: String) -> [Token] {
        let text = text as NSString
        var searchStart = 0
        return expected.map { substring, kind in
            let range = text.range(
                of: substring, range: NSRange(location: searchStart, length: text.length - searchStart))
            searchStart = NSMaxRange(range)
            return Token(range: range, kind: kind)
        }
    }
}
