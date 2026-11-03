import AppKit
import WebKit
import os

/// Find in the Preview (unmark-1793451439168-30-08e35535), styled like NSTextView's find bar: WKWebView can search its
/// page but has no find bar on macOS. The total comes from the renderer's `countMatches`, and each step from
/// `WKWebView.find`, which selects and scrolls to the next match but reports only whether there was one, so the bar
/// counts its steps for "n of m". Both ignore case. A render while the bar is open counts again, and the renderer
/// says where the selection, which the next step starts from, now sits (unmark-1793451427523-5-478d1806.3).
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
    private var place = Place.after(0)
    /// Bumped by each new search and by closing, so answers to an earlier search don't overwrite a later one.
    private var generation = 0
    /// Bumped by each count after a render, so only the latest render's count shows.
    private var recounts = 0

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
        place = .after(0)
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
        place = .after(0)
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
            place = found ? .match(1) : .after(0)
            showStatus()
        }
    }

    /// Called once a render reaches the page. Counts the matches in the new text, keeping the selected one when the
    /// render kept it, rather than search again and move the Preview to the first match.
    func documentDidRender() {
        guard !isHidden, !query.isEmpty, let webView else { return }
        // A search still under way may have counted the text before the render.
        guard matchCount != nil else {
            search()
            return
        }
        recounts += 1
        let generation = generation
        let recount = recounts
        Task {
            let selection = await selectedMatch(of: query, in: webView)
            guard generation == self.generation, recount == recounts, let selection else { return }
            matchCount = selection.count
            place = selection.selected ? .match(selection.before + 1) : .after(selection.before)
            showStatus()
        }
    }

    /// Doesn't check `recounts`: a count after a render reads the selection before or after this step's `find`, and
    /// WebKit answers in that order, so applying the step to whichever place is current keeps them in agreement.
    private func step(backwards: Bool) {
        guard let count = matchCount, count > 0, let webView else { return }
        let generation = generation
        Task {
            guard await find(query, backwards: backwards, in: webView), generation == self.generation else { return }
            place = place.stepped(backwards: backwards, among: matchCount ?? count)
            showStatus()
        }
    }

    private func showStatus() {
        let noResults = !query.isEmpty && matchCount == 0
        if noResults {
            matchLabel.stringValue = String(localized: "No results")
        } else if let matchCount, case .match(let index) = place {
            matchLabel.stringValue = String(localized: "\(index) of \(matchCount)")
        } else if let matchCount {
            // No match is selected after a render removed the selected one. The String Catalog's plural variations
            // give "1 match".
            matchLabel.stringValue = String(localized: "\(matchCount) matches")
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
}

// MARK: Page calls and control actions

extension PreviewFindBar {
    /// Clears the selection first, so `WKWebView.find` starts from the document's top.
    private func countMatches(of query: String, in webView: WKWebView) async -> Int {
        do {
            // `window.unmark` is undefined until the first render has imported the renderer module.
            let count = try await webView.callAsyncJavaScript(
                """
                getSelection()?.removeAllRanges();
                return (await window.unmark?.countMatches(query))?.count ?? 0;
                """,
                arguments: ["query": query], contentWorld: .page)
            return count as? Int ?? 0
        } catch {
            Self.logger.error("Counting matches failed: \(String(describing: error), privacy: .public)")
            return 0
        }
    }

    /// The renderer's `countMatches`, which leaves the selection where the next `WKWebView.find` steps from the
    /// place it reports. Nil when counting failed.
    private func selectedMatch(of query: String, in webView: WKWebView) async -> SelectedMatch? {
        do {
            let answer = try await webView.callAsyncJavaScript(
                "return await window.unmark.countMatches(query);", arguments: ["query": query],
                contentWorld: .page)
            guard let answer = answer as? [String: Any], let count = answer["count"] as? Int,
                let before = answer["before"] as? Int, let selected = answer["selected"] as? Bool
            else { return nil }
            return SelectedMatch(count: count, before: before, selected: selected)
        } catch {
            Self.logger.error("Recounting matches failed: \(String(describing: error), privacy: .public)")
            return nil
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

/// The renderer's `SelectedMatch`: where the selection sits among a query's `count` matches.
private struct SelectedMatch {
    let count: Int
    /// How many matches start before the selection.
    let before: Int
    /// Whether the selection is the match after `before`.
    let selected: Bool
}

/// Where WebKit's selection, which `WKWebView.find` steps from, sits among the matches.
private enum Place {
    /// The selection is the match at this 1-based index.
    case match(Int)
    /// A caret or nothing is selected, after this many matches; nothing selected is the document's top.
    case after(Int)

    /// The match `WKWebView.find` selects next, wrapping around `count` matches.
    func stepped(backwards: Bool, among count: Int) -> Place {
        let index =
            switch self {
            case .match(let index): backwards ? index - 1 : index + 1
            case .after(let before): backwards ? before : before + 1
            }
        return .match(index < 1 ? count : index > count ? 1 : index)
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
