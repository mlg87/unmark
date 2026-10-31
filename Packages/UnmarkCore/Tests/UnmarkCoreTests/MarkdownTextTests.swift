import Foundation
import Testing
import UnmarkCore

struct MarkdownTextTests {
    @Test(arguments: [
        Data("# Title 🎉\r\n\r\nLine one\r\nLine two 👩🏽‍💻\r\n".utf8),
        Data("mixed\r\nendings\nand a lone\rreturn".utf8),
        // A leading byte order mark is part of the file and must survive a save.
        Data([0xEF, 0xBB, 0xBF] + Array("# BOM\r\n".utf8)),
        Data(),
    ])
    func roundTripsValidUTF8ByteForByte(original: Data) {
        let decoded = MarkdownText.decode(original)
        #expect(!decoded.replacedInvalidBytes)
        #expect(MarkdownText.encode(decoded.text) == original)
    }

    @Test func replacesInvalidUTF8WithReplacementCharacter() {
        let invalid = Data(Array("caf".utf8) + [0xE9] + Array(" ok".utf8))
        let decoded = MarkdownText.decode(invalid)
        #expect(decoded.replacedInvalidBytes)
        #expect(decoded.text == "caf\u{FFFD} ok")
    }
}
