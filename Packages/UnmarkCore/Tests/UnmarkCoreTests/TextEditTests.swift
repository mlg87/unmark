import Foundation
import Testing
import UnmarkCore

struct TextEditTests {
    @Test func trimsTheTextTheEditLeftAsItWas() {
        // TextKit reports typing "b" at the end of "a" with the rest of the line.
        #expect(
            TextEdit(at: 4, replacing: "a\n", with: "ab\n")
                == TextEdit(range: NSRange(location: 5, length: 1), replaced: ""))
        #expect(
            TextEdit(at: 0, replacing: "abc\n", with: "ac\n")
                == TextEdit(range: NSRange(location: 1, length: 0), replaced: "b"))
    }

    @Test func trimsWholeCharacters() {
        // 🎉 and 🎈 share their first UTF-16 code unit, and é is e followed by a combining accent.
        #expect(
            TextEdit(at: 0, replacing: "a🎉", with: "a🎈")
                == TextEdit(range: NSRange(location: 1, length: 2), replaced: "🎉"))
        #expect(
            TextEdit(at: 0, replacing: "e\n", with: "e\u{301}\n")
                == TextEdit(range: NSRange(location: 0, length: 2), replaced: "e"))
    }

    /// Applies `edits` to `text` in turn, folding each into the one before when it coalesces, then undoes the result
    /// one step at a time. Returns how many undo steps there were and the text after undoing them all.
    private func undoAll(
        _ text: String, _ edits: [(range: NSRange, replacement: String)]
    ) -> (steps: Int, text: String) {
        var current = text as NSString
        var steps: [TextEdit] = []
        for (range, replacement) in edits {
            let edit = TextEdit(
                range: NSRange(location: range.location, length: (replacement as NSString).length),
                replaced: current.substring(with: range))
            current = current.replacingCharacters(in: range, with: replacement) as NSString
            if let last = steps.last, let merged = last.coalescing(edit) {
                steps[steps.count - 1] = merged
            } else {
                steps.append(edit)
            }
        }
        for step in steps.reversed() {
            current = current.replacingCharacters(in: step.range, with: step.replaced) as NSString
        }
        return (steps.count, current as String)
    }

    @Test func typingOnIsOneStep() {
        let result = undoAll(
            "ab",
            [
                (NSRange(location: 1, length: 0), "x"),
                (NSRange(location: 2, length: 0), "y"),
                (NSRange(location: 3, length: 0), "z"),
            ])
        #expect(result == (1, "ab"))
    }

    @Test func deletingBackwardOverTheTypingAndPastItIsOneStep() {
        let result = undoAll(
            "abc",
            [
                (NSRange(location: 2, length: 0), "x"),
                (NSRange(location: 2, length: 1), ""),
                (NSRange(location: 1, length: 1), ""),
                (NSRange(location: 0, length: 1), ""),
                (NSRange(location: 0, length: 0), "y"),
            ])
        #expect(result == (1, "abc"))
    }

    @Test func deletingForwardAfterTheTypingIsOneStep() {
        let result = undoAll(
            "abc",
            [
                (NSRange(location: 1, length: 0), "x"),
                (NSRange(location: 2, length: 1), ""),
                (NSRange(location: 2, length: 1), ""),
            ])
        #expect(result == (1, "abc"))
    }

    @Test func replacingMarkedTextIsOneStep() {
        // An input method replaces its marked text with each keystroke, then commits it.
        let result = undoAll(
            "a",
            [
                (NSRange(location: 1, length: 0), "k"),
                (NSRange(location: 1, length: 1), "か"),
                (NSRange(location: 1, length: 1), "漢"),
            ])
        #expect(result == (1, "a"))
    }

    @Test func typingSomewhereElseIsANewStep() {
        let result = undoAll(
            "abc",
            [
                (NSRange(location: 3, length: 0), "x"),
                (NSRange(location: 0, length: 0), "y"),
                (NSRange(location: 2, length: 0), "z"),
            ])
        #expect(result == (3, "abc"))
    }

    @Test func doesNotCoalesceAnEditBeforeTheEndOfTheTyping() {
        // Typing "pq" at 1, then typing at 1 or deleting the "p".
        let typed = TextEdit(range: NSRange(location: 1, length: 2), replaced: "")
        #expect(typed.coalescing(TextEdit(range: NSRange(location: 1, length: 1), replaced: "")) == nil)
        #expect(typed.coalescing(TextEdit(range: NSRange(location: 1, length: 0), replaced: "p")) == nil)
    }

    @Test func countsUTF16CodeUnits() {
        // 🎉 is two UTF-16 code units.
        let result = undoAll(
            "🎉a",
            [
                (NSRange(location: 2, length: 0), "🎈"),
                (NSRange(location: 4, length: 0), "b"),
                (NSRange(location: 2, length: 3), ""),
                (NSRange(location: 0, length: 2), ""),
            ])
        #expect(result == (1, "🎉a"))
    }
}
