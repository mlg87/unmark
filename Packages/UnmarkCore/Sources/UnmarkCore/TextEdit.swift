import Foundation

/// One change to a text, as an undo step reverts it (unmark-1793451427066-4-97884ee7.3): `range` of the text after the
/// change holds what replaced `replaced`. Offsets count UTF-16 code units, as NSString and NSTextView do.
public struct TextEdit: Equatable, Sendable {
    public var range: NSRange
    public var replaced: String

    public init(range: NSRange, replaced: String) {
        self.range = range
        self.replaced = replaced
    }

    /// The edit that replaced `replaced`, at `location`, with `replacement`, less the characters at either end that it
    /// left as they were. The text system reports an edit with some of the text around it, such as the rest of the
    /// line, and only the characters that changed can join the typing before them. Trims whole characters, so the
    /// edit never starts or ends inside one.
    public init(at location: Int, replacing replaced: String, with replacement: String) {
        var oldStart = replaced.startIndex
        var newStart = replacement.startIndex
        while oldStart < replaced.endIndex, newStart < replacement.endIndex, replaced[oldStart] == replacement[newStart]
        {
            replaced.formIndex(after: &oldStart)
            replacement.formIndex(after: &newStart)
        }
        var oldEnd = replaced.endIndex
        var newEnd = replacement.endIndex
        while oldEnd > oldStart, newEnd > newStart,
            replaced[replaced.index(before: oldEnd)] == replacement[replacement.index(before: newEnd)]
        {
            replaced.formIndex(before: &oldEnd)
            replacement.formIndex(before: &newEnd)
        }
        self.init(
            range: NSRange(
                location: location + replaced[..<oldStart].utf16.count,
                length: replacement[newStart..<newEnd].utf16.count),
            replaced: String(replaced[oldStart..<oldEnd]))
    }

    /// `self` followed by `next`, as one change, so one undo step reverts both, the way NSTextView coalesces typing.
    /// `next` must end at or past the end of the text `self` put in, as typing on, deleting backward over it, or
    /// replacing marked text does. Nil for any other edit, such as typing somewhere else.
    public func coalescing(_ next: TextEdit) -> TextEdit? {
        let nextReplacedLength = (next.replaced as NSString).length
        let nextStart = next.range.location
        let nextEnd = nextStart + nextReplacedLength
        let start = range.location
        let end = NSMaxRange(range)
        guard nextStart <= end, nextEnd >= end else { return nil }
        // The text `next` replaced before and after the text `self` put in was there before `self` too.
        let nextReplaced = next.replaced as NSString
        let before = nextStart < start ? nextReplaced.substring(to: start - nextStart) : ""
        let after = nextReplaced.substring(from: end - nextStart)
        let mergedStart = min(start, nextStart)
        return TextEdit(
            range: NSRange(location: mergedStart, length: NSMaxRange(next.range) - mergedStart),
            replaced: before + replaced + after)
    }
}
