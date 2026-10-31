import AppKit
import SwiftUI
import UnmarkCore
import os

/// One open markdown file. An `NSDocument` subclass rather than a SwiftUI `FileDocument` (ADR-0003). Info.plist
/// names this class for the `net.daringfireball.markdown` document type.
final class MarkdownDocument: NSDocument {
    nonisolated private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "MarkdownDocument")
    /// Points of Interest, so Instruments shows `open-to-preview` without extra setup (q47: under 1 s for 1 MB).
    nonisolated private static let signposter = OSSignposter(subsystem: "com.mlg87.unmark", category: .pointsOfInterest)

    /// Where the next window's top-left corner goes, so windows cascade instead of stacking exactly.
    @MainActor private static var nextWindowTopLeft = NSPoint.zero

    private(set) var text = ""

    /// From the start of reading the file to the first render reaching the Preview.
    private var openToPreview: OSSignpostIntervalState?

    // Changes reach disk only through an explicit Save (q13, ADR-0003).
    override static var autosavesInPlace: Bool { false }

    // NSDocument calls these overrides on the main thread, because canConcurrentlyReadDocuments(ofType:) and
    // canAsynchronouslyWrite(to:ofType:for:) keep their `false` defaults. The SDK still declares them
    // nonisolated, so each one asserts main-actor isolation before touching `text` or AppKit.

    override func read(from url: URL, ofType typeName: String) throws {
        MainActor.assumeIsolated {
            openToPreview = Self.signposter.beginInterval("open-to-preview", id: Self.signposter.makeSignpostID())
        }
        try super.read(from: url, ofType: typeName)
    }

    override func read(from data: Data, ofType typeName: String) throws {
        let decoded = MarkdownText.decode(data)
        if decoded.replacedInvalidBytes {
            Self.logger.warning("File isn't valid UTF-8; invalid bytes were replaced with U+FFFD")
        }
        MainActor.assumeIsolated { text = decoded.text }
    }

    override func data(ofType typeName: String) throws -> Data {
        MainActor.assumeIsolated { MarkdownText.encode(text) }
    }

    override func makeWindowControllers() {
        MainActor.assumeIsolated {
            // Every document is opened from a file (there are no untitled ones, q21), so `fileURL` is set. Without
            // one, relative paths resolve inside the renderer bundle and match nothing.
            let documentBaseURL =
                fileURL.map(PreviewURL.documentBaseURL(forDocumentAt:)) ?? PreviewURL.rendererPage
            let content = DocumentWindow(text: text, documentBaseURL: documentBaseURL) { [weak self] in
                self?.endOpenToPreview()
            }
            let window = NSWindow(contentViewController: NSHostingController(rootView: content))
            window.setContentSize(NSSize(width: 720, height: 800))
            window.center()
            Self.nextWindowTopLeft = window.cascadeTopLeft(from: Self.nextWindowTopLeft)
            addWindowController(NSWindowController(window: window))
        }
    }

    @MainActor private func endOpenToPreview() {
        guard let openToPreview else { return }
        Self.signposter.endInterval("open-to-preview", openToPreview)
        self.openToPreview = nil
    }
}
