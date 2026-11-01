/// Where each line of a markdown source starts, to map between the Source's text and the 0-based source lines the
/// renderer marks blocks with (unmark-1793451437275-26-1e1952b0). Lines break where markdown-it breaks them: at
/// "\r\n", "\r", and "\n". Offsets count UTF-16 code units, as NSTextView and TextKit do.
public struct SourceLines: Sendable {
    private let starts: [Int]

    public init(_ text: String) {
        var starts = [0]
        var offset = 0
        var previous: UInt16 = 0
        for unit in text.utf16 {
            offset += 1
            if unit == 0x0D {
                starts.append(offset)
            } else if unit == 0x0A {
                // "\r\n" is one break, which the "\r" already recorded.
                if previous == 0x0D {
                    starts[starts.count - 1] = offset
                } else {
                    starts.append(offset)
                }
            }
            previous = unit
        }
        self.starts = starts
    }

    /// The number of lines, counting the empty line after a final line break.
    public var count: Int { starts.count }

    /// The line containing the character at `offset`. A line break belongs to the line it ends.
    public func line(containing offset: Int) -> Int {
        // The last line starting at or before `offset`.
        var low = 0
        var high = starts.count - 1
        while low < high {
            let middle = (low + high + 1) / 2
            if starts[middle] <= offset {
                low = middle
            } else {
                high = middle - 1
            }
        }
        return low
    }

    /// The offset of the first character of `line`, clamped to the first and last lines.
    public func start(ofLine line: Int) -> Int {
        starts[min(max(line, 0), starts.count - 1)]
    }
}
