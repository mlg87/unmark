import AppKit
import SwiftUI
import UnmarkCore

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
        if let step = Self.zoomStep(for: menuItem.action) {
            let zoom = focusedPaneZoom(after: step)
            return zoom.zoomed != zoom.current
        }
        return true
    }

    // MARK: Zoom

    @objc func zoomIn(_ sender: Any?) {
        zoomFocusedPane(.zoomIn)
    }

    @objc func zoomOut(_ sender: Any?) {
        zoomFocusedPane(.zoomOut)
    }

    @objc func zoomToActualSize(_ sender: Any?) {
        zoomFocusedPane(.actualSize)
    }

    private static func zoomStep(for action: Selector?) -> ZoomStep? {
        switch action {
        case #selector(zoomIn(_:)): .zoomIn
        case #selector(zoomOut(_:)): .zoomOut
        case #selector(zoomToActualSize(_:)): .actualSize
        default: nil
        }
    }

    /// Writes the zoom to the defaults, where every window's `DocumentWindow` picks it up through `@AppStorage`.
    private func zoomFocusedPane(_ step: ZoomStep) {
        let zoom = focusedPaneZoom(after: step)
        UserDefaults.standard.set(zoom.zoomed, forKey: zoom.defaultsKey)
    }

    private struct PaneZoom {
        let defaultsKey: String
        let current: Double
        let zoomed: Double
    }

    /// The focused pane's zoom now and after `step`: the Source's font size when the Source or its find bar has the
    /// focus, and the Preview's page zoom otherwise, which in Preview mode is always.
    private func focusedPaneZoom(after step: ZoomStep) -> PaneZoom {
        let defaults = UserDefaults.standard
        if isSourceFocused {
            let size = defaults.object(forKey: SourceFont.sizeKey) as? Double ?? SourceFont.defaultSize
            return PaneZoom(
                defaultsKey: SourceFont.sizeKey, current: size, zoomed: SourceFont.size(after: step, from: size))
        }
        let zoom = defaults.object(forKey: PreviewZoom.defaultsKey) as? Double ?? PreviewZoom.actualSize
        return PaneZoom(
            defaultsKey: PreviewZoom.defaultsKey, current: zoom, zoomed: PreviewZoom.zoom(after: step, from: zoom))
    }

    /// Checks the Source's scroll view rather than the text view, because the find bar sits in the scroll view and
    /// its search field's field editor is the first responder while the user types a search.
    private var isSourceFocused: Bool {
        guard let responder = window?.firstResponder as? NSView,
            let sourceScrollView = sourceTextView?.enclosingScrollView
        else { return false }
        return responder.isDescendant(of: sourceScrollView)
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
