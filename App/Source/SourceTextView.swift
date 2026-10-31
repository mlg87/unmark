import AppKit
import SwiftUI

/// The editable Source: a plain-text NSTextView (q12). Its edits register with the window's undo manager, which is
/// the document's, so NSDocument tracks the dirty state, the close prompt, and undo back to clean (ADR-0003).
struct SourceTextView: NSViewRepresentable {
    @Binding var text: String
    let fontSize: Double
    /// Called before the text view applies an edit, to start the `keystroke-to-preview` interval (q47).
    let willEdit: @MainActor () -> Void

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

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        private let text: Binding<String>
        var lastText = ""

        init(text: Binding<String>) {
            self.text = text
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            let newText = textView.string
            lastText = newText
            text.wrappedValue = newText
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
