import SwiftUI
import UnmarkCore

/// A document window's content: the Outline in a sidebar while it's shown, and the Preview, with the Source beside it
/// in Split mode. Every window opens in Preview mode (q15).
struct DocumentWindow: View {
    /// Narrow enough to read and edit in, and wide enough that two panes fit the window's 480 pt minimum.
    private static let paneMinWidth: CGFloat = 240
    /// How long the Preview waits after an edit for the next one before rendering, so a burst of keystrokes renders
    /// once. Short, because q47 gives keystroke-to-preview only 250 ms for a 1 MB file and the render needs most of it.
    private static let editRenderDebounce = Duration.milliseconds(40)

    @Bindable var state: DocumentState
    let willEdit: @MainActor () -> Void
    let didEdit: @MainActor (TextEdit) -> Void
    let didRender: @MainActor (String) -> Void
    let linkActivated: @MainActor (URL) -> Void
    let taskToggled: @MainActor (_ line: Int, _ checked: Bool) -> Void
    let reloadFromDisk: @MainActor () -> Void
    let keepChanges: @MainActor () -> Void

    /// Both app-wide, so a zoom reaches every open window at once (q36).
    @AppStorage(SourceFont.sizeKey) private var sourceFontSize = SourceFont.defaultSize
    @AppStorage(PreviewZoom.defaultsKey) private var previewZoom = PreviewZoom.actualSize
    @AppStorage(OutlineVisibility.key) private var isOutlineVisible = false
    /// Per window, so each window's panes follow only each other.
    @State private var scrollSync = ScrollSync()

    var body: some View {
        // The sidebar sits outside both panes, so it stays put as Split mode adds and removes the Source.
        NavigationSplitView(columnVisibility: outlineColumnVisibility) {
            OutlineView(
                headings: state.outline, currentHeadingID: state.currentHeadingID,
                headingChosen: { id in
                    state.scrollRequest = ScrollRequest(elementID: id)
                    // Selected at once rather than once the renderer reports the scroll, so the click doesn't flicker
                    // back to the previous row first.
                    state.currentHeadingID = id
                }
            )
            .navigationSplitViewColumnWidth(min: 160, ideal: 220, max: 400)
        } detail: {
            panes
        }
        .frame(minWidth: 480, minHeight: 320)
    }

    /// Collapsing the sidebar by dragging its divider hides the Outline in every window, as ⌃⌘S does.
    private var outlineColumnVisibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { isOutlineVisible ? .all : .detailOnly },
            set: { isOutlineVisible = $0 != .detailOnly })
    }

    private var panes: some View {
        VStack(spacing: 0) {
            if state.fileWasDeleted {
                FileDeletedBanner()
                Divider()
            }
            if state.fileChangedOnDisk {
                FileChangedOnDiskBanner(
                    fileName: state.fileURL?.lastPathComponent ?? "", reloadFromDisk: reloadFromDisk,
                    keepChanges: keepChanges)
                Divider()
            }
            // One split view in both modes, so toggling adds or removes the Source and keeps the Preview's web view
            // and its scroll position.
            HSplitView {
                if state.isSourceVisible {
                    SourceTextView(
                        text: $state.text, fontSize: sourceFontSize, willEdit: willEdit, didEdit: didEdit,
                        scrollSync: scrollSync
                    )
                    .frame(minWidth: Self.paneMinWidth, maxWidth: .infinity)
                }
                PreviewView(
                    markdown: state.text, documentBaseURL: state.documentBaseURL, scrollRequest: state.scrollRequest,
                    printRequest: state.printRequest, zoom: previewZoom,
                    // In Preview mode text changes come only from disk, which ExternalChangeMonitor already debounces,
                    // and from task toggles, one per click.
                    renderDebounce: state.isSourceVisible ? Self.editRenderDebounce : .zero,
                    didRender: { markdown in
                        let lineCount = LineCount.of(markdown)
                        // Setting an equal value still re-renders the status bar.
                        if state.lineCount != lineCount {
                            state.lineCount = lineCount
                        }
                        didRender(markdown)
                    },
                    wordCounted: { wordCount in
                        if state.wordCount != wordCount {
                            state.wordCount = wordCount
                        }
                    },
                    linkActivated: linkActivated, taskToggled: taskToggled,
                    outlineChanged: { headings in
                        // Every render posts its outline, and most leave it as it was.
                        if headings != state.outline {
                            state.outline = headings
                        }
                    },
                    currentHeadingChanged: { id in state.currentHeadingID = id },
                    scrollSync: scrollSync
                )
                .frame(minWidth: Self.paneMinWidth, maxWidth: .infinity)
            }
            // Over the panes, so the notice doesn't cover the status bar.
            .overlay(alignment: .bottom) {
                if let missing = state.missingLinkTarget {
                    MissingLinkTargetNotice(fileName: missing.fileName)
                }
            }
            Divider()
            StatusBar(state: state)
        }
        // A new notice cancels this task and restarts the 3 s (#23).
        .task(id: state.missingLinkTarget) {
            guard state.missingLinkTarget != nil else { return }
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            state.missingLinkTarget = nil
        }
    }
}

/// Under both panes in both modes (q52): the Preview's word count and the Source's line count (q35). Its own view, so
/// a count changing re-renders only the bar.
private struct StatusBar: View {
    let state: DocumentState

    var body: some View {
        HStack {
            Spacer()
            if let wordCount = state.wordCount, let lineCount = state.lineCount {
                // The String Catalog's plural variations give "1 word" and "1 line".
                Text("\(wordCount) words · \(lineCount) lines")
                    .monospacedDigit()
                    .foregroundStyle(Color(nsColor: .secondaryLabelColor))
            }
        }
        .font(.system(size: NSFont.smallSystemFontSize))
        .padding(.horizontal, 10)
        .frame(height: 22)
    }
}

/// Shown above the Preview once the file is deleted on disk (#24).
private struct FileDeletedBanner: View {
    var body: some View {
        Label("File was deleted", systemImage: "exclamationmark.triangle.fill")
            .symbolRenderingMode(.multicolor)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.bar)
    }
}

/// Shown above both panes when the file changed on disk while the document has unsaved edits (#28, q14, q53). Not a
/// sheet or alert, so typing in the Source carries on while it's shown.
private struct FileChangedOnDiskBanner: View {
    let fileName: String
    let reloadFromDisk: @MainActor () -> Void
    let keepChanges: @MainActor () -> Void

    var body: some View {
        HStack {
            Text("\(fileName) changed on disk.")
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Reload from Disk", action: reloadFromDisk)
            Button("Keep My Changes", action: keepChanges)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(nsColor: .systemYellow).opacity(0.2))
    }
}

/// Shown over the bottom of the Preview for 3 s after a click on a link to a file that doesn't exist (#23).
private struct MissingLinkTargetNotice: View {
    let fileName: String

    var body: some View {
        Label("File not found: \(fileName)", systemImage: "questionmark.folder")
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: .capsule)
            .padding(.bottom, 12)
    }
}
