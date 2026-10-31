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

    private let state = DocumentState()

    private lazy var externalChanges = ExternalChangeMonitor(
        fileDidChange: { [weak self] in self?.reloadIfChangedOnDisk() },
        fileWasDeleted: { [weak self] in self?.state.fileWasDeleted = true },
        fileDidReappear: { [weak self] in self?.state.fileWasDeleted = false })

    /// From the start of reading the file to the first render reaching the Preview.
    private var openToPreview: OSSignpostIntervalState?

    // Changes reach disk only through an explicit Save (q13, ADR-0003).
    override static var autosavesInPlace: Bool { false }

    // NSDocument calls these overrides on the main thread, because canConcurrentlyReadDocuments(ofType:) and
    // canAsynchronouslyWrite(to:ofType:for:) keep their `false` defaults. The SDK still declares them
    // nonisolated, so each one asserts main-actor isolation before touching `text` or AppKit.

    override func read(from url: URL, ofType typeName: String) throws {
        MainActor.assumeIsolated {
            // A reload reads again into the existing window; only the read before the window exists is an open.
            if windowControllers.isEmpty {
                openToPreview = Self.signposter.beginInterval(
                    "open-to-preview", id: Self.signposter.makeSignpostID())
            }
        }
        try super.read(from: url, ofType: typeName)
    }

    override func read(from data: Data, ofType typeName: String) throws {
        let decoded = MarkdownText.decode(data)
        if decoded.replacedInvalidBytes {
            Self.logger.warning("File isn't valid UTF-8; invalid bytes were replaced with U+FFFD")
        }
        MainActor.assumeIsolated { state.text = decoded.text }
    }

    override func data(ofType typeName: String) throws -> Data {
        MainActor.assumeIsolated { MarkdownText.encode(state.text) }
    }

    override func makeWindowControllers() {
        MainActor.assumeIsolated {
            // Every document is opened from a file (there are no untitled ones, q21), so `fileURL` is set.
            state.fileURL = fileURL
            let content = DocumentWindow(
                state: state,
                didRender: { [weak self] in self?.endOpenToPreview() },
                linkActivated: { [weak self] url in self?.followLink(to: url) })
            let window = NSWindow(contentViewController: NSHostingController(rootView: content))
            window.setContentSize(NSSize(width: 720, height: 800))
            window.center()
            Self.nextWindowTopLeft = window.cascadeTopLeft(from: Self.nextWindowTopLeft)
            addWindowController(NSWindowController(window: window))
            if let fileURL {
                externalChanges.watch(fileURL)
            }
        }
    }

    /// Sends a link clicked in the Preview where `LinkRouter` says it goes (#23).
    @MainActor private func followLink(to url: URL) {
        // `state.fileURL` already follows a move that `fileURL` hasn't caught up with yet.
        guard let documentURL = state.fileURL else { return }
        switch LinkRouter.route(url: url, documentURL: documentURL) {
        case .anchor(let elementID):
            state.scrollRequest = ScrollRequest(elementID: elementID)
        case .markdownFile(let fileURL, let fragment):
            NSDocumentController.shared.openDocument(withContentsOf: fileURL, display: true) { document, _, error in
                // NSDocumentController calls this on the main thread, and doesn't present errors itself.
                MainActor.assumeIsolated {
                    if let error {
                        NSDocumentController.shared.presentError(error)
                    } else if let fragment, let document = document as? MarkdownDocument {
                        document.state.scrollRequest = ScrollRequest(elementID: fragment)
                    }
                }
            }
        case .external(let target):
            NSWorkspace.shared.open(target)
        case .missingFile(let target):
            NSSound.beep()
            state.missingLinkTarget = MissingLinkTarget(fileName: target.lastPathComponent)
        }
    }

    override func close() {
        externalChanges.stop()
        super.close()
    }

    // NSDocument's presenter callbacks arrive on its presenter queue. Reading the file from inside one can return
    // without running the read (ADR-0003), so the work hops to the main actor.

    nonisolated override func presentedItemDidChange() {
        super.presentedItemDidChange()
        guard let fileURL else { return }
        Task { @MainActor [weak self] in
            self?.externalChanges.presenterReportedChange(at: fileURL)
        }
    }

    /// `super` updates `fileURL` and the window title.
    nonisolated override func presentedItemDidMove(to newURL: URL) {
        super.presentedItemDidMove(to: newURL)
        Task { @MainActor [weak self] in
            guard let self else { return }
            state.fileURL = newURL
            externalChanges.watch(newURL)
        }
    }

    /// Replaces the text with the file's when another app changed it (#24, ADR-0003).
    @MainActor private func reloadIfChangedOnDisk() {
        // `state.fileURL` already follows a move that `fileURL` hasn't caught up with yet.
        guard var url = state.fileURL, let fileType else { return }
        // URL caches resource values per instance, and this one may have read the date before the change.
        url.removeAllCachedResourceValues()
        guard let modified = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        else { return }
        // The presenter's late duplicate of a change the vnode source already reloaded.
        guard modified != fileModificationDate else { return }
        // Unsaved edits are never replaced here; the conflict banner (#28) handles them.
        guard !isDocumentEdited else { return }
        do {
            try revert(toContentsOf: url, ofType: fileType)
        } catch {
            Self.logger.error("Reload failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    @MainActor private func endOpenToPreview() {
        guard let openToPreview else { return }
        Self.signposter.endInterval("open-to-preview", openToPreview)
        self.openToPreview = nil
    }
}
