import AppKit
import Testing
import UnmarkAppKit
import UnmarkCore

/// Drives a real NSTextView with `SourceHighlighting` through the methods keystrokes call (#159).
@MainActor
struct SourceHighlightingTests {
    /// Every token kind draws in one color body text never has, so a pixel tells a token from body text.
    private static let tokenColor = NSColor.systemRed

    /// The text storage holds its delegate weakly, so the source keeps `highlighting` alive.
    private struct Source {
        let window: NSWindow
        let textView: NSTextView
        let highlighting: SourceHighlighting
    }

    private func makeSource(_ text: String) throws -> Source {
        _ = NSApplication.shared
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 400), styleMask: [.titled], backing: .buffered,
            defer: false)
        // Light, so body text draws dark on white.
        window.appearance = NSAppearance(named: .aqua)
        let scrollView = NSTextView.scrollableTextView()
        let textView = try #require(scrollView.documentView as? NSTextView)
        // The Source runs on TextKit 2. Reading `layoutManager` would switch the view to TextKit 1.
        try #require(textView.textLayoutManager != nil)
        textView.isRichText = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        let highlighting = SourceHighlighting(
            colors: Dictionary(
                uniqueKeysWithValues: MarkdownHighlighter.TokenKind.allCases.map { ($0, Self.tokenColor) }))
        textView.textStorage?.delegate = highlighting
        textView.string = text
        scrollView.frame = try #require(window.contentView).bounds
        window.contentView?.addSubview(scrollView)
        window.makeFirstResponder(textView)
        return Source(window: window, textView: textView, highlighting: highlighting)
    }

    private func type(_ characters: String, into textView: NSTextView) {
        for character in characters {
            textView.insertText(String(character), replacementRange: NSRange(location: NSNotFound, length: 0))
        }
    }

    @Test func typingInsideAHeadingKeepsTheCaretAfterEachCharacter() throws {
        let text = "# Title\n\n## Bug found\n\nNext line\n"
        let source = try makeSource(text)
        let caret = NSMaxRange((text as NSString).range(of: "## Bug"))
        source.textView.setSelectedRange(NSRange(location: caret, length: 0))

        type("xyz", into: source.textView)

        #expect(source.textView.string == "# Title\n\n## Bugxyz found\n\nNext line\n")
        #expect(source.textView.selectedRange() == NSRange(location: caret + 3, length: 0))
    }

    /// The report's steps: on the last line of a file with no final line break, delete a selected word.
    @Test func deletingInsideALineKeepsTheCaretWhereTheTextWas() throws {
        let text = "Intro\n\nA sentence with one word to delete"
        let source = try makeSource(text)
        let word = (text as NSString).range(of: "word")
        source.textView.setSelectedRange(word)

        source.textView.deleteBackward(nil)
        #expect(source.textView.selectedRange() == NSRange(location: word.location, length: 0))

        source.textView.deleteBackward(nil)
        #expect(source.textView.string == "Intro\n\nA sentence with one to delete")
        #expect(source.textView.selectedRange() == NSRange(location: word.location - 1, length: 0))
    }

    /// The colors change after the text storage processed the edit, and still have to replace the layout the lines
    /// below already had, which the edit itself didn't touch.
    @Test func openingAFenceRedrawsTheLinesBelowInItsColor() throws {
        let text = "Intro\n\nplain words below\nmore plain words\n"
        let source = try makeSource(text)
        let textView = source.textView
        let layoutManager = try #require(textView.textLayoutManager)
        layoutManager.ensureLayout(for: layoutManager.documentRange)
        textView.display()
        // Typing on the empty line adds no line, so the lines below stay where they are.
        let below = try lineRect(of: "more plain words", in: textView)
        let before = try ink(in: below, of: textView)
        #expect(before.body > 0 && before.token == 0)

        textView.setSelectedRange(NSRange(location: NSMaxRange((text as NSString).range(of: "Intro\n")), length: 0))
        type("```", into: textView)

        let after = try ink(in: below, of: textView)
        #expect(after.token > 0 && after.body == 0)
    }

    private func lineRect(of line: String, in textView: NSTextView) throws -> NSRect {
        let layoutManager = try #require(textView.textLayoutManager)
        let contentManager = try #require(layoutManager.textContentManager)
        let offset = (textView.string as NSString).range(of: line).location
        let location = try #require(contentManager.location(contentManager.documentRange.location, offsetBy: offset))
        let fragment = try #require(layoutManager.textLayoutFragment(for: location))
        let origin = textView.textContainerOrigin
        return fragment.layoutFragmentFrame.offsetBy(dx: origin.x, dy: origin.y)
    }

    /// Draws the text view as it draws on screen, reusing the layout it has, and counts the pixels in `rect` drawn in
    /// the token color and in body text's color. Antialiased edges count as neither.
    private func ink(in rect: NSRect, of textView: NSTextView) throws -> (token: Int, body: Int) {
        let bitmap = try #require(textView.bitmapImageRepForCachingDisplay(in: textView.bounds))
        textView.cacheDisplay(in: textView.bounds, to: bitmap)
        let scale = CGFloat(bitmap.pixelsWide) / textView.bounds.width
        var counts = (token: 0, body: 0)
        for row in Int(rect.minY * scale)..<Int(rect.maxY * scale) {
            for column in Int(rect.minX * scale)..<Int(rect.maxX * scale) {
                guard let color = bitmap.colorAt(x: column, y: row)?.usingColorSpace(.sRGB), color.alphaComponent > 0.5
                else { continue }
                let (red, green, blue) = (color.redComponent, color.greenComponent, color.blueComponent)
                if red > 0.6, green < 0.45, blue < 0.45 {
                    counts.token += 1
                } else if red < 0.5, green < 0.5, blue < 0.5 {
                    counts.body += 1
                }
            }
        }
        return counts
    }
}
