import AppKit
import WebKit
import os

/// The Preview pane: the find bar, while it's open, above the web view. A plain view around the stack, so SwiftUI sizes
/// the pane to its proposal as it does a bare web view.
final class PreviewPaneView: NSView {
    init(webView: WKWebView) {
        super.init(frame: .zero)
        let findBar = PreviewFindBar(webView: webView)
        // A stack view gives the hidden find bar's height to the web view.
        let stack = NSStackView(views: [findBar, webView])
        stack.orientation = .vertical
        stack.spacing = 0
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            findBar.widthAnchor.constraint(equalTo: stack.widthAnchor),
            webView.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])
        webView.setContentHuggingPriority(.defaultLow, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("PreviewPaneView is created in code")
    }
}

/// Find in the Preview (unmark-1793451439168-30-08e35535), styled like NSTextView's find bar: WKWebView can search its
/// page but has no find bar on macOS. The total comes from the renderer's `countMatches`, and each step from
/// `WKWebView.find`, which selects and scrolls to the next match but reports only whether there was one, so the bar
/// counts its steps for "n of m". Both ignore case.
@MainActor
final class PreviewFindBar: NSVisualEffectView, NSSearchFieldDelegate {
    private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "PreviewFindBar")
    /// The actions of Edit → Find the bar performs. Use Selection for Find isn't one: the Preview has no Find
    /// pasteboard support.
    private static let actions: Set<NSTextFinder.Action> = [
        .showFindInterface, .hideFindInterface, .nextMatch, .previousMatch,
    ]

    private weak var webView: WKWebView?
    private let searchField = FindSearchField()
    private let matchLabel = NSTextField(labelWithString: "")
    private let previousOrNext = NSSegmentedControl()
    /// The search the count and the current match belong to; the field may already hold a newer one.
    private var query = ""
    /// Nil until the renderer has counted `query`'s matches.
    private var matchCount: Int?
    /// 1-based; zero before the first step to a match.
    private var currentMatch = 0
    /// Bumped by each new search and by closing, so answers to an earlier search don't overwrite a later one.
    private var generation = 0

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        material = .headerView
        blendingMode = .withinWindow
        isHidden = true

        searchField.controlSize = .small
        searchField.font = .systemFont(ofSize: NSFont.smallSystemFontSize)
        searchField.sendsSearchStringImmediately = true
        searchField.sendsWholeSearchString = false
        searchField.delegate = self
        searchField.target = self
        searchField.action = #selector(searchFieldChanged(_:))
        searchField.fieldEditor.findBar = self
        searchField.setContentHuggingPriority(.defaultLow, for: .horizontal)

        matchLabel.font = .monospacedDigitSystemFont(ofSize: NSFont.smallSystemFontSize, weight: .regular)
        matchLabel.textColor = .secondaryLabelColor
        matchLabel.setContentCompressionResistancePriority(.required, for: .horizontal)

        let previous = String(localized: "Previous")
        let next = String(localized: "Next")
        previousOrNext.segmentCount = 2
        previousOrNext.trackingMode = .momentary
        previousOrNext.controlSize = .small
        previousOrNext.setImage(
            NSImage(systemSymbolName: "chevron.left", accessibilityDescription: previous), forSegment: 0)
        previousOrNext.setImage(
            NSImage(systemSymbolName: "chevron.right", accessibilityDescription: next), forSegment: 1)
        previousOrNext.setToolTip(previous, forSegment: 0)
        previousOrNext.setToolTip(next, forSegment: 1)
        previousOrNext.target = self
        previousOrNext.action = #selector(previousOrNextClicked(_:))

        let doneButton = NSButton(title: String(localized: "Done"), target: self, action: #selector(doneClicked(_:)))
        doneButton.controlSize = .small
        doneButton.font = .systemFont(ofSize: NSFont.smallSystemFontSize)

        layOut([searchField, matchLabel, previousOrNext, doneButton])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("PreviewFindBar is created in code")
    }

    /// Lays `views` out in a row, leading to trailing, above a separator.
    private func layOut(_ views: [NSView]) {
        let controls = NSStackView(views: views)
        controls.orientation = .horizontal
        controls.spacing = 8
        controls.edgeInsets = NSEdgeInsets(top: 5, left: 8, bottom: 5, right: 8)
        controls.translatesAutoresizingMaskIntoConstraints = false
        let separator = NSBox()
        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false
        addSubview(controls)
        addSubview(separator)
        NSLayoutConstraint.activate([
            controls.topAnchor.constraint(equalTo: topAnchor),
            controls.leadingAnchor.constraint(equalTo: leadingAnchor),
            controls.trailingAnchor.constraint(equalTo: trailingAnchor),
            separator.topAnchor.constraint(equalTo: controls.bottomAnchor),
            separator.leadingAnchor.constraint(equalTo: leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: trailingAnchor),
            separator.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    /// Whether `performTextFinderAction(from:)` acts on the Edit → Find item with this tag.
    static func performs(tag: Int) -> Bool {
        NSTextFinder.Action(rawValue: tag).map(actions.contains) ?? false
    }

    /// Performs the Edit → Find item that sent `performTextFinderAction(_:)`, from its tag.
    func performTextFinderAction(from sender: Any?) {
        guard let tag = (sender as? NSValidatedUserInterfaceItem)?.tag,
            let action = NSTextFinder.Action(rawValue: tag)
        else { return }
        switch action {
        case .showFindInterface:
            open()
        case .nextMatch, .previousMatch:
            // Like NSTextView's find bar, Find Next opens the bar when there's nothing to step through.
            if isHidden || query.isEmpty {
                open()
            } else {
                step(backwards: action == .previousMatch)
            }
        case .hideFindInterface:
            close()
        default:
            break
        }
    }

    /// Shows the bar and focuses its field with the text selected. Reopening searches again for the text the field
    /// kept, since closing cleared the matches.
    private func open() {
        let wasHidden = isHidden
        isHidden = false
        window?.makeFirstResponder(searchField)
        if wasHidden, !searchField.stringValue.isEmpty {
            search()
        }
    }

    /// Hides the bar, clears the selected match, and gives focus back to the Preview.
    private func close() {
        guard !isHidden else { return }
        generation += 1
        matchCount = nil
        currentMatch = 0
        showStatus()
        if let webView {
            // Before hiding the bar, so the field ends editing rather than vanishing with the focus.
            window?.makeFirstResponder(webView)
            Task { await clearSelection(in: webView) }
        }
        isHidden = true
    }

    /// Counts `query`'s matches, then selects the first in the document, so the bar reads "1 of m".
    private func search() {
        generation += 1
        let generation = generation
        let query = searchField.stringValue
        self.query = query
        matchCount = nil
        currentMatch = 0
        showStatus()
        guard let webView else { return }
        Task {
            guard !query.isEmpty else {
                await clearSelection(in: webView)
                return
            }
            let count = await countMatches(of: query, in: webView)
            guard generation == self.generation else { return }
            let found = count > 0 ? await find(query, backwards: false, in: webView) : false
            guard generation == self.generation else { return }
            // WebKit finding nothing is no results, whatever the renderer counted.
            matchCount = found ? count : 0
            currentMatch = found ? 1 : 0
            showStatus()
        }
    }

    private func step(backwards: Bool) {
        guard let count = matchCount, count > 0, let webView else { return }
        let generation = generation
        Task {
            guard await find(query, backwards: backwards, in: webView), generation == self.generation else { return }
            if backwards {
                currentMatch = currentMatch <= 1 ? count : currentMatch - 1
            } else {
                currentMatch = currentMatch >= count ? 1 : currentMatch + 1
            }
            showStatus()
        }
    }

    private func showStatus() {
        let noResults = !query.isEmpty && matchCount == 0
        if noResults {
            matchLabel.stringValue = String(localized: "No results")
        } else if let matchCount, currentMatch > 0 {
            matchLabel.stringValue = String(localized: "\(currentMatch) of \(matchCount)")
        } else {
            matchLabel.stringValue = ""
        }
        let textColor: NSColor = noResults ? .systemRed : .controlTextColor
        searchField.textColor = textColor
        // The field editor draws the text while the field is being edited.
        if searchField.currentEditor() != nil {
            searchField.fieldEditor.textColor = textColor
        }
    }

    /// Clears the selection first, so `WKWebView.find` starts from the document's top.
    private func countMatches(of query: String, in webView: WKWebView) async -> Int {
        do {
            // `window.unmark` is undefined until the first render has imported the renderer module.
            let count = try await webView.callAsyncJavaScript(
                """
                getSelection()?.removeAllRanges();
                return (await window.unmark?.countMatches(query)) ?? 0;
                """,
                arguments: ["query": query], contentWorld: .page)
            return count as? Int ?? 0
        } catch {
            Self.logger.error("Counting matches failed: \(String(describing: error), privacy: .public)")
            return 0
        }
    }

    private func find(_ query: String, backwards: Bool, in webView: WKWebView) async -> Bool {
        let configuration = WKFindConfiguration()
        configuration.backwards = backwards
        configuration.caseSensitive = false
        configuration.wraps = true
        return await withCheckedContinuation { continuation in
            webView.find(query, configuration: configuration) { result in
                continuation.resume(returning: result.matchFound)
            }
        }
    }

    /// The selection is how `WKWebView.find` shows its match.
    private func clearSelection(in webView: WKWebView) async {
        do {
            _ = try await webView.callAsyncJavaScript(
                "getSelection()?.removeAllRanges();", contentWorld: .page)
        } catch {
            Self.logger.error("Clearing the match failed: \(String(describing: error), privacy: .public)")
        }
    }

    @objc private func searchFieldChanged(_ sender: NSSearchField) {
        // The field also sends its action when nothing changed, such as when it ends editing.
        guard sender.stringValue != query else { return }
        search()
    }

    @objc private func previousOrNextClicked(_ sender: NSSegmentedControl) {
        step(backwards: sender.selectedSegment == 0)
    }

    @objc private func doneClicked(_ sender: Any?) {
        close()
    }

    // MARK: NSSearchFieldDelegate

    /// Return steps to the next match and Shift-Return to the previous one, as in NSTextView's find bar. Escape
    /// closes the bar, where a plain search field would clear its text.
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        switch commandSelector {
        case #selector(NSResponder.insertNewline(_:)):
            step(backwards: NSApp.currentEvent?.modifierFlags.contains(.shift) ?? false)
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            close()
            return true
        default:
            return false
        }
    }
}

/// The find bar's search field, edited with its own field editor.
private final class FindSearchField: NSSearchField {
    override static var cellClass: AnyClass? {
        get { FindSearchFieldCell.self }
        set { super.cellClass = newValue }
    }

    var fieldEditor: FindFieldEditor {
        guard let cell = cell as? FindSearchFieldCell else {
            preconditionFailure("FindSearchField's cellClass is FindSearchFieldCell")
        }
        return cell.editor
    }
}

private final class FindSearchFieldCell: NSSearchFieldCell {
    let editor = FindFieldEditor()

    override func fieldEditor(for controlView: NSView) -> NSTextView? {
        editor
    }
}

/// Sends Edit → Find to the find bar while its field is being edited. The window's shared field editor, an NSTextView,
/// would take Find Next and Find Previous itself and do nothing with them.
private final class FindFieldEditor: NSTextView {
    weak var findBar: PreviewFindBar?

    convenience init() {
        self.init(frame: .zero)
        isFieldEditor = true
    }

    override func performTextFinderAction(_ sender: Any?) {
        findBar?.performTextFinderAction(from: sender)
    }

    override func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        guard menuItem.action == #selector(performTextFinderAction(_:)) else {
            return super.validateMenuItem(menuItem)
        }
        return PreviewFindBar.performs(tag: menuItem.tag)
    }
}
