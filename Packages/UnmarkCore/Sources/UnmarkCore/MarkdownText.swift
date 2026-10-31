import Foundation

/// Converts between a markdown file's bytes and its text. Unmark reads and writes UTF-8 only.
public enum MarkdownText {
    public struct Decoded: Equatable, Sendable {
        public let text: String
        /// True when the bytes weren't valid UTF-8, so each invalid sequence became U+FFFD.
        public let replacedInvalidBytes: Bool
    }

    public static func decode(_ data: Data) -> Decoded {
        // The lossy decode is intentional: a file with invalid bytes still opens, showing U+FFFD for them.
        // swiftlint:disable:next optional_data_string_conversion
        let text = String(decoding: data, as: UTF8.self)
        // Valid UTF-8 re-encodes to exactly the input, while a lossy decode doesn't. Comparing the views
        // detects invalid input without a second, strict decoding pass.
        return Decoded(text: text, replacedInvalidBytes: !text.utf8.elementsEqual(data))
    }

    public static func encode(_ text: String) -> Data {
        Data(text.utf8)
    }
}
