import AppKit
import SwiftUI

/// A document's window: the SwiftUI content under a toolbar with the Split mode toggle. The toolbar button and
/// View → Show Source both send `toggleSource(_:)` up the responder chain, which reaches this controller.
@MainActor
final class DocumentWindowController: NSWindowController, NSWindowDelegate, NSToolbarDelegate, NSMenuItemValidation {
    private static let toggleSourceItem = NSToolbarItem.Identifier("toggleSource")

    private let state: DocumentState
    private weak var toggleSourceToolbarItem: NSToolbarItem?

    init(state: DocumentState, content: DocumentWindow) {
        self.state = state
        super.init(window: NSWindow(contentViewController: NSHostingController(rootView: content)))
        window?.delegate = self
        let toolbar = NSToolbar(identifier: "DocumentWindow")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        window?.toolbar = toolbar
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("DocumentWindowController is created in code")
    }

    /// The View menu item's title for the current mode; the menu shows "Show Source" before any window exists.
    static func toggleSourceTitle(sourceVisible: Bool) -> String {
        sourceVisible ? String(localized: "Hide Source") : String(localized: "Show Source")
    }

    @objc func toggleSource(_ sender: Any?) {
        state.isSourceVisible.toggle()
        toggleSourceToolbarItem?.toolTip = Self.toggleSourceToolTip(sourceVisible: state.isSourceVisible)
    }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        if menuItem.action == #selector(toggleSource(_:)) {
            menuItem.title = Self.toggleSourceTitle(sourceVisible: state.isSourceVisible)
        }
        return true
    }

    /// The Source's text view, while Split mode shows it.
    var sourceTextView: SourceNSTextView? {
        var views = window?.contentView.map { [$0] } ?? []
        while let view = views.popLast() {
            if let textView = view as? SourceNSTextView {
                return textView
            }
            views.append(contentsOf: view.subviews)
        }
        return nil
    }

    private static func toggleSourceToolTip(sourceVisible: Bool) -> String {
        sourceVisible ? String(localized: "Hide Source (⇧⌘E)") : String(localized: "Show Source (⇧⌘E)")
    }

    // MARK: NSWindowDelegate

    /// Edit → Undo and Redo use the window's undo manager. Handing them the document's, where the document registers
    /// every edit, lets NSDocument track the dirty state from them, including undoing back to the saved text
    /// (ADR-0003).
    func windowWillReturnUndoManager(_ window: NSWindow) -> UndoManager? {
        document?.undoManager
    }

    // MARK: NSToolbarDelegate

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.flexibleSpace, Self.toggleSourceItem]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        toolbarDefaultItemIdentifiers(toolbar)
    }

    func toolbar(
        _ toolbar: NSToolbar, itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
        willBeInsertedIntoToolbar flag: Bool
    ) -> NSToolbarItem? {
        guard itemIdentifier == Self.toggleSourceItem else { return nil }
        let item = NSToolbarItem(itemIdentifier: itemIdentifier)
        let title = Self.toggleSourceTitle(sourceVisible: state.isSourceVisible)
        item.label = title
        item.image = NSImage(systemSymbolName: "rectangle.split.2x1", accessibilityDescription: title)
        item.toolTip = Self.toggleSourceToolTip(sourceVisible: state.isSourceVisible)
        item.isBordered = true
        item.action = #selector(toggleSource(_:))
        item.target = self
        toggleSourceToolbarItem = item
        return item
    }
}
