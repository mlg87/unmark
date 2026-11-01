import AppKit
import SwiftUI
import UnmarkCore

/// The editable Source: a plain-text NSTextView (q12). Its edits register with the window's undo manager, which is
/// the document's, so NSDocument tracks the dirty state, the close prompt, and undo back to clean (ADR-0003).
struct SourceTextView: NSViewRepresentable {
    @Binding var text: String
    let fontSize: Double
    /// Called before the text view applies an edit, to start the `keystroke-to-preview` interval (q47).
    let willEdit: @MainActor () -> Void
    /// Keeps the Source and the Preview on the same source line.
    let scrollSync: ScrollSync

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = SourceNSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? SourceNSTextView else {
            preconditionFailure("SourceNSTextView.scrollableTextView() holds a NSTextView of its own class")
        }
        // `scrollableTextView()` already soft-wraps to the pane width.
        textView.isRichText = false
        textView.importsGraphics = false
        textView.allowsUndo = true
        textView.usesFindBar = true
        textView.isIncrementalSearchingEnabled = true
        // Markdown is code-like: typographic substitutions would change what the file says.
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.textContainerInset = NSSize(width: 8, height: 8)
        textView.font = .monospacedSystemFont(ofSize: fontSize, weight: .regular)
        textView.string = text
        // Opens at the top, like the Preview, rather than with the caret at the end of the file.
        textView.setSelectedRange(NSRange(location: 0, length: 0))
        textView.delegate = context.coordinator
        context.coordinator.lastText = text
        context.coordinator.textView = textView
        context.coordinator.scrollSync = scrollSync
        // The clip view's bounds move whenever the Source scrolls, by the user or to follow the Preview.
        scrollView.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            context.coordinator, selector: #selector(Coordinator.sourceDidScroll(_:)),
            name: NSView.boundsDidChangeNotification, object: scrollView.contentView)
        scrollSync.scrollSource = { [weak coordinator = context.coordinator] line in
            coordinator?.scroll(toLine: line)
        }
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? SourceNSTextView else { return }
        textView.willEdit = willEdit
        let font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        if textView.font != font {
            textView.font = font
        }
        // `lastText` is the String the text view last produced or received, so for the text view's own edits this
        // compares one storage with itself and skips reading 1 MB back out of the text view on every keystroke.
        guard text != context.coordinator.lastText else { return }
        context.coordinator.lastText = text
        // The text changed underneath the Source, from a reload or Revert. The document clears the undo stack then,
        // since its actions name ranges of the old text.
        let selection = textView.selectedRange()
        textView.string = text
        let length = (text as NSString).length
        let location = min(selection.location, length)
        textView.setSelectedRange(NSRange(location: location, length: min(selection.length, length - location)))
    }

    /// Maps the Source's scroll position to and from 0-based source lines with TextKit 2, which lays out a text
    /// layout fragment per paragraph, so per source line.
    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        private let text: Binding<String>
        var lastText = "" {
            didSet { cachedLines = nil }
        }
        weak var textView: NSTextView?
        var scrollSync: ScrollSync?
        /// Built from `lastText` on the first scroll after it changes, not on every keystroke.
        private var cachedLines: SourceLines?

        init(text: Binding<String>) {
            self.text = text
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            let newText = textView.string
            lastText = newText
            text.wrappedValue = newText
        }

        @objc func sourceDidScroll(_ notification: Notification) {
            guard let line = lineAtTop() else { return }
            scrollSync?.paneDidScroll(.source, toLine: line)
        }

        /// Scrolls so 0-based source `line` is at the top, a fractional line that far into the line's height.
        func scroll(toLine line: Double) {
            guard let textView, let scrollView = textView.enclosingScrollView,
                let layoutManager = textView.textLayoutManager, let contentManager = layoutManager.textContentManager,
                let location = contentManager.location(
                    contentManager.documentRange.location, offsetBy: sourceLines.start(ofLine: Int(line)))
            else { return }
            let top: CGFloat
            if line <= 0 {
                // Line 0 is the top of the pane, inset included, as it's the top of the Preview's page.
                top = 0
            } else {
                layoutManager.ensureLayout(for: NSTextRange(location: location))
                // The empty line after a final line break has no fragment: it's the end of the text.
                let frame = layoutManager.textLayoutFragment(for: location)?.layoutFragmentFrame
                top =
                    frame.map { $0.minY + $0.height * (line - line.rounded(.down)) + textView.textContainerOrigin.y }
                    ?? textView.bounds.maxY
            }
            let clipView = scrollView.contentView
            let target = NSRect(origin: NSPoint(x: clipView.bounds.minX, y: top), size: clipView.bounds.size)
            clipView.scroll(to: clipView.constrainBoundsRect(target).origin)
            scrollView.reflectScrolledClipView(clipView)
        }

        /// The 0-based source line at the top of the Source, plus how far into its height the top is.
        private func lineAtTop() -> Double? {
            guard let textView, let layoutManager = textView.textLayoutManager,
                let contentManager = layoutManager.textContentManager
            else { return nil }
            let top = textView.visibleRect.minY - textView.textContainerOrigin.y
            guard let fragment = layoutManager.textLayoutFragment(for: CGPoint(x: 0, y: max(top, 0))) else {
                return nil
            }
            let offset = contentManager.offset(
                from: contentManager.documentRange.location, to: fragment.rangeInElement.location)
            let frame = fragment.layoutFragmentFrame
            let fraction = frame.height > 0 ? min(max((top - frame.minY) / frame.height, 0), 1) : 0
            return Double(sourceLines.line(containing: offset)) + fraction
        }

        private var sourceLines: SourceLines {
            if let cachedLines { return cachedLines }
            let lines = SourceLines(lastText)
            cachedLines = lines
            return lines
        }
    }
}

/// Starts the `keystroke-to-preview` interval where the text system accepts an edit. When Split mode shows the
/// Source, it takes focus so typing can start right away, and splits the window 50/50.
final class SourceNSTextView: NSTextView {
    var willEdit: @MainActor () -> Void = {}

    override func shouldChangeText(inRanges affectedRanges: [NSValue], replacementStrings: [String]?) -> Bool {
        let allowed = super.shouldChangeText(inRanges: affectedRanges, replacementStrings: replacementStrings)
        if allowed {
            willEdit()
        }
        return allowed
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }
        window.makeFirstResponder(self)
        // SwiftUI's HSplitView, an NSSplitView, inserts a new pane at its minimum width and has no API for the
        // divider, so the Source centers it once the split view has laid out with both panes.
        DispatchQueue.main.async { [weak self] in
            guard let splitView = self?.enclosingSplitView else { return }
            splitView.layoutSubtreeIfNeeded()
            splitView.setPosition((splitView.bounds.width - splitView.dividerThickness) / 2, ofDividerAt: 0)
        }
    }

    private var enclosingSplitView: NSSplitView? {
        sequence(first: superview, next: { $0?.superview }).lazy.compactMap { $0 as? NSSplitView }.first
    }
}

/// The Source font size. The key is shared with zoom and Settings, which change it.
enum SourceFont {
    static let sizeKey = "sourceFontSize"
    static let defaultSize = 13.0
}
