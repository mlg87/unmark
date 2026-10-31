import AppKit
import SwiftUI
import UnmarkCore
import os

/// One open markdown file. An `NSDocument` subclass rather than a SwiftUI `FileDocument` (ADR-0003). Info.plist
/// names this class for the `net.daringfireball.markdown` document type.
final class MarkdownDocument: NSDocument {
    nonisolated private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "MarkdownDocument")

    /// Where the next window's top-left corner goes, so windows cascade instead of stacking exactly.
    @MainActor private static var nextWindowTopLeft = NSPoint.zero

    private(set) var text = ""

    // Changes reach disk only through an explicit Save (q13, ADR-0003).
    override static var autosavesInPlace: Bool { false }

    // NSDocument calls these overrides on the main thread, because canConcurrentlyReadDocuments(ofType:) and
    // canAsynchronouslyWrite(to:ofType:for:) keep their `false` defaults. The SDK still declares them
    // nonisolated, so each one asserts main-actor isolation before touching `text` or AppKit.

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
            let window = NSWindow(contentViewController: NSHostingController(rootView: DocumentWindow(text: text)))
            window.setContentSize(NSSize(width: 720, height: 800))
            window.center()
            Self.nextWindowTopLeft = window.cascadeTopLeft(from: Self.nextWindowTopLeft)
            addWindowController(NSWindowController(window: window))
        }
    }
}
