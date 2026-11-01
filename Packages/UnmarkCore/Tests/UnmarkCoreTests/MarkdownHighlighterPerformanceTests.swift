// XCTest ships with Xcode, not with the Command Line Tools, so the file compiles only where XCTest exists. CI's Xcode
// runs it.
#if canImport(XCTest)
    import Foundation
    import UnmarkCore
    import XCTest

    final class MarkdownHighlighterPerformanceTests: XCTestCase {
        /// Typing inside a 1 MB document re-highlights within one 60 Hz frame (unmark-1793451436816-25-a00dd960):
        /// a keystroke re-reads only the lines around it, however long the document.
        func testRehighlightingAKeystrokeInAMegabyteDocumentFitsInAFrame() {
            let section = """
                ## Section

                Some *emphasis*, **strong** text, `code`, and a [link](https://example.com) in a paragraph that \
                runs on long enough to wrap in the Source, with <kbd>keys</kbd> and https://github.com too.

                - a list item
                > a quote

                ```swift
                let value = compute(**arguments)
                ```


                """
            let text = NSString(string: String(repeating: section, count: 1_000_000 / section.utf16.count + 1))
            let keystroke = NSRange(location: text.length / 2, length: 1)
            var slowest = Duration.zero
            measure {
                let elapsed = ContinuousClock().measure {
                    let lines = MarkdownHighlighter.linesToRehighlight(in: text, editedRange: keystroke)
                    _ = MarkdownHighlighter.highlight(text, lines: lines, startingIn: .body)
                }
                slowest = max(slowest, elapsed)
            }
            XCTAssertGreaterThanOrEqual(text.length, 1_000_000)
            XCTAssertLessThan(slowest, .milliseconds(16))
        }
    }
#endif
