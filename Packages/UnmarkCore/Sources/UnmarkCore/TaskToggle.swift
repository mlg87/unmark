/// Ticks and unticks task-list items in a markdown source (unmark-1793451438253-28-4df62a6e): a checkbox clicked in
/// the Preview names the 0-based line of its list item, and the edit flips that line's `[ ]` or `[x]`. Lines break
/// where markdown-it breaks them, as `SourceLines` does.
public enum TaskToggle {
    /// The character between a task's brackets, which a toggle replaces.
    public struct Marker: Equatable, Sendable {
        /// Where the character is, in UTF-16 code units as NSString and NSTextView count. It is one code unit long.
        public let utf16Offset: Int
        public let isChecked: Bool

        /// The character that flips the task: `x` for an unticked task, a space for a ticked one.
        public var flipped: String { isChecked ? " " : "x" }
    }

    /// The marker of the task-list item on `line`. Nil when the line doesn't start one, such as when the Preview that
    /// named it is stale.
    public static func marker(text: String, line: Int) -> Marker? {
        guard let found = locate(in: text, line: line) else { return nil }
        return Marker(
            utf16Offset: text.utf16.distance(from: text.startIndex, to: found.position), isChecked: found.isChecked)
    }

    /// `text` with the task marker on `line` flipped: `[ ]` to `[x]`, and `[x]` or `[X]` to `[ ]`. Nil when the line
    /// doesn't start a task-list item.
    public static func toggle(text: String, line: Int) -> String? {
        guard let found = locate(in: text, line: line) else { return nil }
        var toggled = text
        toggled.unicodeScalars.replaceSubrange(
            found.position...found.position, with: CollectionOfOne(found.isChecked ? " " : "x"))
        return toggled
    }

    /// Finds the marker after the line's blockquote and list-item prefixes, such as `> 1. - [ ] a`. The character
    /// after `]` must be a space, as @mdit/plugin-tasklist requires. It also reads U+00A0 as a space, inside the
    /// brackets too.
    private static func locate(in text: String, line: Int) -> (position: String.Index, isChecked: Bool)? {
        let scalars = text.unicodeScalars
        guard var cursor = start(ofLine: line, in: scalars) else { return nil }
        var sawBullet = false
        while cursor < scalars.endIndex {
            if let afterBullet = end(ofBulletAt: cursor, in: scalars) {
                sawBullet = true
                cursor = afterBullet
            } else if isBlank(scalars[cursor]) || scalars[cursor] == ">" {
                cursor = scalars.index(after: cursor)
            } else {
                break
            }
        }
        let head = Array(scalars[cursor...].prefix(4))
        guard sawBullet, head.count == 4, head[0] == "[", head[2] == "]", isSpace(head[3]) else { return nil }
        let position = scalars.index(after: cursor)
        switch head[1] {
        case " ", "\u{A0}": return (position, false)
        case "x", "X": return (position, true)
        default: return nil
        }
    }

    /// The index after a list-item bullet (`-`, `*`, `+`, or up to nine digits and `.` or `)`) and the space that must
    /// follow it, or nil when there's none at `start`.
    private static func end(
        ofBulletAt start: String.UnicodeScalarView.Index, in scalars: String.UnicodeScalarView
    ) -> String.UnicodeScalarView.Index? {
        var end = start
        switch scalars[end] {
        case "-", "*", "+":
            end = scalars.index(after: end)
        case "0"..."9":
            var digits = 0
            while end < scalars.endIndex, ("0"..."9").contains(scalars[end]), digits < 9 {
                end = scalars.index(after: end)
                digits += 1
            }
            guard end < scalars.endIndex, scalars[end] == "." || scalars[end] == ")" else { return nil }
            end = scalars.index(after: end)
        default:
            return nil
        }
        guard end < scalars.endIndex, isBlank(scalars[end]) else { return nil }
        return scalars.index(after: end)
    }

    /// Indentation and the space after a bullet, as CommonMark reads them.
    private static func isBlank(_ scalar: Unicode.Scalar) -> Bool {
        scalar == " " || scalar == "\t"
    }

    /// The plugin also takes U+00A0 inside and after the brackets.
    private static func isSpace(_ scalar: Unicode.Scalar) -> Bool {
        isBlank(scalar) || scalar == "\u{A0}"
    }

    /// Where 0-based `line` starts, breaking at "\r\n", "\r", and "\n"; nil past the last line.
    private static func start(ofLine line: Int, in scalars: String.UnicodeScalarView)
        -> String.UnicodeScalarView.Index?
    {
        guard line >= 0 else { return nil }
        var index = scalars.startIndex
        var remaining = line
        while remaining > 0 {
            guard let lineBreak = scalars[index...].firstIndex(where: { $0 == "\n" || $0 == "\r" }) else { return nil }
            index = scalars.index(after: lineBreak)
            if scalars[lineBreak] == "\r", index < scalars.endIndex, scalars[index] == "\n" {
                index = scalars.index(after: index)
            }
            remaining -= 1
        }
        return index
    }
}
