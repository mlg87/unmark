import Testing
import UnmarkCore

struct LineCountTests {
    @Test(arguments: [
        ("", 0),
        ("a", 1),
        ("a\n", 1),
        ("a\nb", 2),
        ("a\r\nb", 2),
        ("a\rb", 2),
        ("a\r\n", 1),
        ("\n", 1),
        ("a\n\n", 2),
        ("🎉\n🎉", 2),
    ])
    func countsLinesAsTheSourceShowsThem(text: String, lines: Int) {
        #expect(LineCount.of(text) == lines)
    }
}
