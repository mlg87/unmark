import Testing
import UnmarkCore

struct TaskToggleTests {
    @Test(arguments: [
        ("- [ ] a", "- [x] a"),
        ("* [X] b", "* [ ] b"),
        ("+ [x] b", "+ [ ] b"),
        ("1. [ ] d", "1. [x] d"),
        ("12) [x] d", "12) [ ] d"),
        ("> - [ ] e", "> - [x] e"),
        ("- - [ ] f", "- - [x] f"),
    ])
    func flipsTheMarker(line: String, toggled: String) {
        #expect(TaskToggle.toggle(text: line, line: 0) == toggled)
    }

    @Test func flipsOnlyTheNamedLine() {
        let text = "- [ ] a\n  - [ ] c\n- [ ] d"
        #expect(TaskToggle.toggle(text: text, line: 1) == "- [ ] a\n  - [x] c\n- [ ] d")
    }

    @Test func countsLinesAsMarkdownItDoes() {
        // 🎉 is several bytes and two UTF-16 code units; "\r\n" and "\r" are one break each.
        let text = "🎉\r\n- [ ] a\r- [x] b\n- [ ] c"
        #expect(TaskToggle.toggle(text: text, line: 1) == "🎉\r\n- [x] a\r- [x] b\n- [ ] c")
        #expect(TaskToggle.toggle(text: text, line: 2) == "🎉\r\n- [ ] a\r- [ ] b\n- [ ] c")
        #expect(TaskToggle.toggle(text: text, line: 3) == "🎉\r\n- [ ] a\r- [x] b\n- [x] c")
    }

    @Test(arguments: [
        "- a",
        "[ ] not in a list",
        "- [ ]",
        "- [ ]\nnext",
        "- [y] z",
        "-[ ] no space after the bullet",
        "- [ ]no space after the marker",
        "    code",
        "",
    ])
    func aLineWithoutATaskIsStale(line: String) {
        #expect(TaskToggle.toggle(text: line, line: 0) == nil)
        #expect(TaskToggle.marker(text: line, line: 0) == nil)
    }

    @Test func aLineOutsideTheTextIsStale() {
        #expect(TaskToggle.toggle(text: "- [ ] a", line: 1) == nil)
        #expect(TaskToggle.toggle(text: "- [ ] a", line: -1) == nil)
    }

    @Test func locatesTheMarkerInUTF16CodeUnits() {
        // 🎉 is two UTF-16 code units, so line 1 starts at offset 3.
        let text = "🎉\n- [ ] a\n- [X] b"
        let unticked = TaskToggle.marker(text: text, line: 1)
        let ticked = TaskToggle.marker(text: text, line: 2)
        #expect(unticked?.utf16Offset == 6)
        #expect(unticked?.isChecked == false)
        #expect(ticked?.utf16Offset == 14)
        #expect(ticked?.isChecked == true)
        #expect(unticked?.flipped == "x")
        #expect(ticked?.flipped == " ")
    }
}
