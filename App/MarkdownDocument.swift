import AppKit
import SwiftUI
import UniformTypeIdentifiers
import UnmarkCore
import os

/// One open markdown file. An `NSDocument` subclass rather than a SwiftUI `FileDocument` (ADR-0003). Info.plist
/// names this class for the `net.daringfireball.markdown` document type.
final class MarkdownDocument: NSDocument {
    nonisolated private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "MarkdownDocument")
    /// Points of Interest, so Instruments shows `open-to-preview` (q47: under 1 s for 1 MB) and
    /// `keystroke-to-preview` (q47: under 250 ms for 1 MB) without extra setup.
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
    /// From the earliest Source edit the Preview doesn't show yet to the render that shows every edit.
    private var keystrokeToPreview: OSSignpostIntervalState?

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

    override func save(
        to url: URL, ofType typeName: String, for saveOperation: NSDocument.SaveOperationType,
        completionHandler: @escaping (Error?) -> Void
    ) {
        MainActor.assumeIsolated {
            for case let windowController as DocumentWindowController in windowControllers {
                windowController.breakUndoCoalescing()
            }
        }
        super.save(to: url, ofType: typeName, for: saveOperation, completionHandler: completionHandler)
    }

    /// ⌘S, and Save in the close prompt. While the changed-on-disk banner shows, saving overwrites the disk version
    /// and dismisses the banner, without NSDocument's "changed by another application" alert (#28).
    override func save(
        withDelegate delegate: Any?, didSave didSaveSelector: Selector?, contextInfo: UnsafeMutableRawPointer?
    ) {
        MainActor.assumeIsolated {
            if state.fileChangedOnDisk {
                keepChanges()
            }
        }
        super.save(withDelegate: delegate, didSave: didSaveSelector, contextInfo: contextInfo)
    }

    /// The Source's undo actions name ranges of the text a revert replaces, so they go with it. A revert also
    /// answers the changed-on-disk banner, since the text is the disk version again.
    override func revert(toContentsOf url: URL, ofType typeName: String) throws {
        try super.revert(toContentsOf: url, ofType: typeName)
        MainActor.assumeIsolated {
            undoManager?.removeAllActions()
            state.fileChangedOnDisk = false
        }
    }

    override func makeWindowControllers() {
        MainActor.assumeIsolated {
            // Every document is opened from a file (there are no untitled ones, q21), so `fileURL` is set.
            state.fileURL = fileURL
            let content = DocumentWindow(
                state: state,
                willEdit: { [weak self] in self?.beginKeystrokeToPreview() },
                didRender: { [weak self] markdown in self?.previewDidRender(markdown) },
                linkActivated: { [weak self] url in self?.followLink(to: url) },
                taskToggled: { [weak self] line, checked in self?.toggleTask(onLine: line, checked: checked) },
                reloadFromDisk: { [weak self] in self?.reloadFromDisk() },
                keepChanges: { [weak self] in self?.keepChanges() })
            let windowController = DocumentWindowController(state: state, content: content)
            if let window = windowController.window {
                window.setContentSize(NSSize(width: 720, height: 800))
                window.center()
                Self.nextWindowTopLeft = window.cascadeTopLeft(from: Self.nextWindowTopLeft)
            }
            addWindowController(windowController)
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

    /// Ticks or unticks a task whose checkbox was clicked in the Preview (unmark-1793451438253-28-4df62a6e, q25), as an
    /// edit of the text in either mode, so it marks the document dirty and ⌘Z reverts it.
    @MainActor private func toggleTask(onLine line: Int, checked: Bool) {
        // A Preview that hasn't caught up with the latest edits can name a line that no longer holds the task, or one
        // whose task already has the state the click asked for. The marker is found in the text the edit applies to.
        guard let undoManager,
            let marker = TaskToggle.marker(text: sourceTextView?.string ?? state.text, line: line),
            marker.isChecked != checked
        else { return }
        // The click arrives as a script message, outside any event. AppKit closes the undo group it opens for a
        // registration only after the next event, and NSDocument marks itself dirty only then, so the toggle closes a
        // group of its own.
        let groupsByEvent = undoManager.groupsByEvent
        if undoManager.groupingLevel == 0 {
            undoManager.groupsByEvent = false
        }
        undoManager.beginUndoGrouping()
        replaceText(
            in: NSRange(location: marker.utf16Offset, length: 1), with: marker.flipped,
            actionName: String(localized: "Toggle Task"))
        undoManager.endUndoGrouping()
        undoManager.groupsByEvent = groupsByEvent
    }

    /// Replaces `range` of the text, in UTF-16 code units, as one change on the document's undo manager, which
    /// NSDocument counts toward the dirty state. The document registers the undo step itself in both modes: an undo
    /// step the Source's text view registers messages that text view, which is gone once Split mode hides the Source.
    @MainActor private func replaceText(in range: NSRange, with replacement: String, actionName: String) {
        let sourceTextView = self.sourceTextView
        let text = (sourceTextView?.string ?? state.text) as NSString
        guard NSMaxRange(range) <= text.length else { return }
        let replaced = text.substring(with: range)
        let changedRange = NSRange(location: range.location, length: (replacement as NSString).length)
        if let sourceTextView {
            // Through the text view, as typing goes, so it keeps the selection and its own earlier undo steps in step
            // with its text. Ends the current typing undo step first, so ⌘Z undoes this change alone.
            sourceTextView.breakUndoCoalescing()
            sourceTextView.allowsUndo = false
            defer { sourceTextView.allowsUndo = true }
            guard sourceTextView.shouldChangeText(in: range, replacementString: replacement) else { return }
            sourceTextView.textStorage?.replaceCharacters(in: range, with: replacement)
            sourceTextView.didChangeText()
        } else {
            state.text = text.replacingCharacters(in: range, with: replacement)
        }
        undoManager?.registerUndo(withTarget: self) { document in
            MainActor.assumeIsolated {
                document.replaceText(in: changedRange, with: replaced, actionName: actionName)
            }
        }
        undoManager?.setActionName(actionName)
    }

    /// The Source's text view, while Split mode shows it.
    @MainActor private var sourceTextView: SourceNSTextView? {
        windowControllers.lazy.compactMap { ($0 as? DocumentWindowController)?.sourceTextView }.first
    }

    /// The paper size from File → Page Setup…, which Print… and Export as PDF… use. App-wide rather than NSDocument's
    /// per-document copy, whose setter records each Page Setup change as an edit to the file.
    override var printInfo: NSPrintInfo {
        get { NSPrintInfo.shared }
        set { NSPrintInfo.shared = newValue }
    }

    /// Prints the Preview, never the Source (#34). Instead of NSDocument's `printOperation(withSettings:)`, which
    /// must return its operation synchronously: the Preview switches to print output in JavaScript before printing.
    override func printDocument(_ sender: Any?) {
        state.printRequest = PrintRequest(destination: .printPanel)
    }

    /// File → Export as PDF…: the Preview's print output saved as a paginated PDF (q54). Replaces NSDocument's
    /// version for the same reason as `printDocument(_:)`, and so the file defaults to the document's name and folder.
    override func saveToPDF(_ sender: Any?) {
        guard let window = windowControllers.first?.window, let documentURL = state.fileURL else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pdf]
        panel.directoryURL = documentURL.deletingLastPathComponent()
        panel.nameFieldStringValue =
            documentURL.deletingPathExtension().appendingPathExtension("pdf")
            .lastPathComponent
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.state.printRequest = PrintRequest(destination: .pdf(url))
        }
    }

    override func close() {
        externalChanges.stop()
        // Posted after `super` so the window is already gone when a waiting `unmark --wait` returns (#37).
        let closedURL = fileURL
        super.close()
        if let closedURL {
            OpenDocumentsBroadcaster.shared.documentClosed(at: closedURL)
        }
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

    /// Replaces the text with the file's when another app changed it (#24, ADR-0003). With unsaved edits, shows the
    /// changed-on-disk banner instead (#28). Another change while it shows keeps the one banner, and its Reload from
    /// Disk reads whatever the file holds when clicked.
    @MainActor private func reloadIfChangedOnDisk() {
        guard let url = state.fileURL, let fileType, let modified = diskModificationDate(of: url) else { return }
        // The presenter's late duplicate of a change the vnode source already reloaded.
        guard modified != fileModificationDate else { return }
        guard !isDocumentEdited else {
            state.fileChangedOnDisk = true
            return
        }
        do {
            try revert(toContentsOf: url, ofType: fileType)
        } catch {
            Self.logger.error("Reload failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The banner's Reload from Disk: the disk text replaces the unsaved edits, and `revert` clears the dirty state,
    /// the undo history, and the banner.
    @MainActor private func reloadFromDisk() {
        // `state.fileURL` already follows a move that `fileURL` hasn't caught up with yet.
        guard let url = state.fileURL, let fileType else { return }
        do {
            try revert(toContentsOf: url, ofType: fileType)
        } catch {
            presentError(error)
        }
    }

    /// The banner's Keep My Changes. Taking the file's current date as the one the document last read or wrote lets
    /// the next save overwrite the disk version with no "changed by another application" alert (ADR-0003).
    @MainActor private func keepChanges() {
        if let url = state.fileURL, let modified = diskModificationDate(of: url) {
            fileModificationDate = modified
        }
        state.fileChangedOnDisk = false
    }

    @MainActor private func diskModificationDate(of url: URL) -> Date? {
        var url = url
        // URL caches resource values per instance, and this one may have read the date before the change.
        url.removeAllCachedResourceValues()
        return try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
    }

    @MainActor private func previewDidRender(_ markdown: String) {
        if let openToPreview {
            Self.signposter.endInterval("open-to-preview", openToPreview)
            self.openToPreview = nil
        }
        // A render that started before the latest edits leaves the interval open for the render that has them. The
        // Preview renders the very String the Source produced, so the usual equal case compares one storage with
        // itself.
        if let keystrokeToPreview, markdown == state.text {
            Self.signposter.endInterval("keystroke-to-preview", keystrokeToPreview)
            self.keystrokeToPreview = nil
        }
    }

    /// Only the earliest edit the Preview doesn't show yet starts an interval, so each interval is the longest wait
    /// among the edits one render covers.
    @MainActor private func beginKeystrokeToPreview() {
        guard keystrokeToPreview == nil else { return }
        keystrokeToPreview = Self.signposter.beginInterval(
            "keystroke-to-preview", id: Self.signposter.makeSignpostID())
    }
}
