import Foundation
import Testing
import UnmarkCore

@MainActor
struct ScrollSyncTests {
    private let start = ContinuousClock.now

    @Test func eachPaneFollowsTheOther() {
        var time = start
        let sync = ScrollSync(now: { time })
        var source: [Double] = []
        var preview: [Double] = []
        sync.scrollSource = { source.append($0) }
        sync.scrollPreview = { preview.append($0) }

        sync.paneDidScroll(.source, toLine: 12)
        time += .seconds(1)
        sync.paneDidScroll(.preview, toLine: 40.5)

        #expect(preview == [12])
        #expect(source == [40.5])
    }

    @Test func theOtherPaneIsIgnoredUntilTheOwnerStopsFor150ms() {
        var time = start
        let sync = ScrollSync(now: { time })
        var source: [Double] = []
        sync.scrollSource = { source.append($0) }

        sync.paneDidScroll(.source, toLine: 10)
        time += .milliseconds(100)
        sync.paneDidScroll(.source, toLine: 11)
        // 149 ms after the Source's latest scroll, not its first.
        time += .milliseconds(149)
        sync.paneDidScroll(.preview, toLine: 11.2)
        #expect(source.isEmpty)

        time += .milliseconds(1)
        sync.paneDidScroll(.preview, toLine: 30)
        #expect(source == [30])
    }

    /// Fast trackpad scrolling in `pane`: a scroll every 8 ms for 600 ms. Each pane echoes a follow with a scroll
    /// report of its own, a little off the requested line as layout rounding makes it: the Source at once, as its
    /// bounds change, and the Preview a frame or two later, when its page posts the scroll.
    @Test(arguments: [SplitPane.source, .preview])
    func fastScrollingSettlesWithoutOscillating(in pane: SplitPane) {
        var time = start
        let sync = ScrollSync(now: { time })
        var follows: [(at: ContinuousClock.Instant, line: Double)] = []
        var previewEchoes: [(at: ContinuousClock.Instant, line: Double)] = []
        sync.scrollSource = { line in
            follows.append((time, line))
            sync.paneDidScroll(.source, toLine: line + 0.01)
        }
        sync.scrollPreview = { line in
            follows.append((time, line))
            let frames = follows.count.isMultiple(of: 2) ? 1 : 2
            previewEchoes.append((time + .milliseconds(16 * frames), line - 0.01))
        }

        var line = 0.0
        var lastInput = start
        for millisecond in 0..<2_000 {
            time = start + .milliseconds(millisecond)
            if millisecond < 600, millisecond.isMultiple(of: 8) {
                line += 0.7
                lastInput = time
                sync.paneDidScroll(pane, toLine: line)
            }
            for echo in previewEchoes where echo.at == time {
                sync.paneDidScroll(.preview, toLine: echo.line)
            }
        }

        // The other pane ends on the user's last line, and nothing moves once the input stops.
        #expect(follows.last?.line == line)
        #expect(follows.allSatisfy { $0.at <= lastInput })
    }

    @Test func theSourceStartsOnThePreviewsLineWhenItAppears() async {
        let time = start
        let sync = ScrollSync(now: { time })
        var source: [Double] = []
        var preview: [Double] = []
        sync.scrollSource = { source.append($0) }
        sync.scrollPreview = { preview.append($0) }
        sync.previewLineAtTop = { 126.6 }

        await sync.sourceDidAppear()
        // The Source reports the scroll it just made, a little off as layout rounds it.
        sync.paneDidScroll(.source, toLine: 126.61)

        #expect(source == [126.6])
        #expect(preview.isEmpty)
    }
}

struct SourceLinesTests {
    @Test func breaksLinesWhereMarkdownItDoes() {
        let lines = SourceLines("a\nb\r\nc\rd")
        #expect(lines.count == 4)
        #expect((0..<4).map(lines.start(ofLine:)) == [0, 2, 5, 7])
    }

    @Test func aLineBreakBelongsToTheLineItEnds() {
        let lines = SourceLines("ab\r\ncd\n")
        #expect((0...6).map(lines.line(containing:)) == [0, 0, 0, 0, 1, 1, 1])
        // The empty line after the final break.
        #expect(lines.count == 3)
        #expect(lines.line(containing: 7) == 2)
    }

    @Test func countsUTF16CodeUnits() {
        // 🎉 is two UTF-16 code units.
        let lines = SourceLines("🎉\nx")
        #expect(lines.start(ofLine: 1) == 3)
    }

    @Test func clampsLinesOutsideTheText() {
        let lines = SourceLines("a\nb")
        #expect(lines.start(ofLine: -1) == 0)
        #expect(lines.start(ofLine: 9) == 2)
    }
}

struct PreviewMessageTests {
    @Test func parsesAScroll() {
        #expect(PreviewMessage(body: ["type": "previewScrolled", "line": 12.5]) == .previewScrolled(line: 12.5))
        // WebKit hands JavaScript numbers over as NSNumber, including whole ones.
        let wholeLine: [String: Any] = ["type": "previewScrolled", "line": NSNumber(value: 3)]
        #expect(PreviewMessage(body: wholeLine) == .previewScrolled(line: 3))
    }

    @Test func parsesATaskToggle() {
        // WebKit hands JavaScript numbers and booleans over as NSNumber.
        let body: [String: Any] = ["type": "taskToggled", "line": NSNumber(value: 4), "checked": NSNumber(value: true)]
        #expect(PreviewMessage(body: body) == .taskToggled(line: 4, checked: true))
    }

    @Test func rejectsMalformedBodies() {
        #expect(PreviewMessage(body: "previewScrolled") == nil)
        #expect(PreviewMessage(body: ["type": "other", "line": 1]) == nil)
        #expect(PreviewMessage(body: ["type": "previewScrolled"]) == nil)
        #expect(PreviewMessage(body: ["type": "previewScrolled", "line": "1"]) == nil)
        #expect(PreviewMessage(body: ["type": "previewScrolled", "line": Double.nan]) == nil)
        #expect(PreviewMessage(body: ["type": "taskToggled", "line": NSNumber(value: 1.5), "checked": true]) == nil)
        #expect(PreviewMessage(body: ["type": "taskToggled", "line": NSNumber(value: -1), "checked": true]) == nil)
        #expect(PreviewMessage(body: ["type": "taskToggled", "line": NSNumber(value: 1)]) == nil)
    }
}
