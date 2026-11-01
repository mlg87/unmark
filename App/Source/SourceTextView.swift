import AppKit
import SwiftUI
import UnmarkCore

/// The editable Source: a plain-text NSTextView (q12). It registers no undo steps of its own: it reports each edit to
/// the document, which registers the undo step (unmark-1793451427066-4-97884ee7.3). An undo step the text view
/// registered would message that text view, which is gone once Split mode hides the Source.
struct SourceTextView: NSViewRepresentable {
    @Binding var text: String
    let fontSize: Double
    /// Called before the text view applies an edit, to start the `keystroke-to-preview` interval (q47).
    let willEdit: @MainActor () -> Void
    /// Called after each edit to the Source's characters, with what the edit replaced, so the document can undo it.
    let didEdit: @MainActor (TextEdit) -> Void
    /// Keeps the Source and the Preview on the same source line.
    let scrollSync: ScrollSync

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, didEdit: didEdit)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = SourceNSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? SourceNSTextView else {
            preconditionFailure("SourceNSTextView.scrollableTextView() holds a NSTextView of its own class")
        }
        // `scrollableTextView()` already soft-wraps to the pane width.
        textView.isRichText = false
        textView.importsGraphics = false
        textView.allowsUndo = false
        textView.usesFindBar = true
        textView.isIncrementalSearchingEnabled = true
        // Markdown is code-like: typographic substitutions would change what the file says.
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.textContainerInset = NSSize(width: 8, height: 8)
        textView.font = .monospacedSystemFont(ofSize: fontSize, weight: .regular)
        // Set before the text, so the first edit colors the whole document.
        textView.textStorage?.delegate = context.coordinator.highlighting
        textView.string = text
        // Opens at the top, like the Preview, rather than with the caret at the end of the file.
        textView.setSelectedRange(NSRange(location: 0, length: 0))
        context.coordinator.lastText = text
        NotificationCenter.default.addObserver(
            context.coordinator, selector: #selector(Coordinator.sourceTextDidChange(_:)),
            name: NSTextStorage.didProcessEditingNotification, object: textView.textStorage)
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
        textView.didAppear = { [scrollSync] in
            Task { await scrollSync.sourceDidAppear() }
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
        context.coordinator.isReplacingText = true
        textView.string = text
        context.coordinator.isReplacingText = false
        let length = (text as NSString).length
        let location = min(selection.location, length)
        textView.setSelectedRange(NSRange(location: location, length: min(selection.length, length - location)))
    }

    /// Maps the Source's scroll position to and from 0-based source lines with TextKit 2, which lays out a text
    /// layout fragment per paragraph, so per source line.
    @MainActor
    final class Coordinator: NSObject {
        private let text: Binding<String>
        private let didEdit: @MainActor (TextEdit) -> Void
        var lastText = "" {
            didSet { cachedLines = nil }
        }
        /// Set while `updateNSView` puts text that came from the binding into the text view.
        var isReplacingText = false
        weak var textView: NSTextView?
        var scrollSync: ScrollSync?
        /// Owned here because the text storage holds its delegate weakly.
        let highlighting = SourceHighlighting()
        /// Built from `lastText` on the first scroll after it changes, not on every keystroke.
        private var cachedLines: SourceLines?

        init(text: Binding<String>, didEdit: @escaping @MainActor (TextEdit) -> Void) {
            self.text = text
            self.didEdit = didEdit
        }

        /// Every change to the Source's characters, typed or not. The text storage reports where each one is, which
        /// `textDidChange` doesn't.
        @objc func sourceTextDidChange(_ notification: Notification) {
            guard !isReplacingText, let textStorage = notification.object as? NSTextStorage,
                textStorage.editedMask.contains(.editedCharacters)
            else { return }
            // `lastText` is the text before this edit. The edited range is where the edit's text is now. It spans every
            // change one round of editing made, and can take in text around them that stayed the same.
            let edited = textStorage.editedRange
            let replaced = (lastText as NSString).substring(
                with: NSRange(location: edited.location, length: edited.length - textStorage.changeInLength))
            let replacement = textStorage.mutableString.substring(with: edited)
            let newText = textStorage.string
            lastText = newText
            text.wrappedValue = newText
            didEdit(TextEdit(at: edited.location, replacing: replaced, with: replacement))
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
                // The whole line, so its fragment is laid out rather than estimated, even far from what's on screen.
                let lineEnd = contentManager.location(
                    contentManager.documentRange.location, offsetBy: sourceLines.start(ofLine: Int(line) + 1))
                layoutManager.ensureLayout(
                    for: NSTextRange(location: location, end: lineEnd) ?? NSTextRange(location: location))
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
/// Source, it takes focus so typing can start right away, splits the window 50/50, and then calls `didAppear`.
final class SourceNSTextView: NSTextView {
    var willEdit: @MainActor () -> Void = {}
    /// Called once the Source has its 50/50 width, so its lines wrap as they will stay.
    var didAppear: @MainActor () -> Void = {}

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
            guard let self, let splitView = enclosingSplitView else { return }
            splitView.layoutSubtreeIfNeeded()
            splitView.setPosition((splitView.bounds.width - splitView.dividerThickness) / 2, ofDividerAt: 0)
            didAppear()
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
