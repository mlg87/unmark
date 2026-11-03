/// How many lines the status bar shows for the Source's text (unmark-1793451440089-32-11f0a691, q35). Lines break where
/// markdown-it and `SourceLines` break them: at "\r\n", "\r", and "\n". An empty text has no lines, and a final line
/// break ends the last line rather than starting another, as editors number lines.
public enum LineCount {
    public static func of(_ text: String) -> Int {
        guard !text.isEmpty else { return 0 }
        var breaks = 0
        var previous: UInt8 = 0
        // UTF-8, the native storage of a Swift string, so a 1 MB document is counted without transcoding it on every
        // render. Neither break character occurs inside a multibyte sequence.
        for byte in text.utf8 {
            // "\r\n" is one break, which the "\r" already counted.
            if byte == 0x0D || (byte == 0x0A && previous != 0x0D) {
                breaks += 1
            }
            previous = byte
        }
        let endsWithBreak = previous == 0x0D || previous == 0x0A
        return endsWithBreak ? breaks : breaks + 1
    }
}
