import SwiftUI
import UnmarkCore

/// A document window's content: the Preview, with the Source beside it in Split mode. Every window opens in Preview
/// mode (q15).
struct DocumentWindow: View {
    /// Narrow enough to read and edit in, and wide enough that two panes fit the window's 480 pt minimum.
    private static let paneMinWidth: CGFloat = 240
    /// How long the Preview waits after an edit for the next one before rendering, so a burst of keystrokes renders
    /// once. Short, because q47 gives keystroke-to-preview only 250 ms for a 1 MB file and the render needs most of it.
    private static let editRenderDebounce = Duration.milliseconds(40)

    @Bindable var state: DocumentState
    let willEdit: @MainActor () -> Void
    let didRender: @MainActor (String) -> Void
    let linkActivated: @MainActor (URL) -> Void

    @AppStorage(SourceFont.sizeKey) private var sourceFontSize = SourceFont.defaultSize
    /// Per window, so each window's panes follow only each other.
    @State private var scrollSync = ScrollSync()

    var body: some View {
        VStack(spacing: 0) {
            if state.fileWasDeleted {
                FileDeletedBanner()
                Divider()
            }
            // One split view in both modes, so toggling adds or removes the Source and keeps the Preview's web view
            // and its scroll position.
            HSplitView {
                if state.isSourceVisible {
                    SourceTextView(
                        text: $state.text, fontSize: sourceFontSize, willEdit: willEdit, scrollSync: scrollSync
                    )
                    .frame(minWidth: Self.paneMinWidth, maxWidth: .infinity)
                }
                PreviewView(
                    markdown: state.text, documentBaseURL: state.documentBaseURL, scrollRequest: state.scrollRequest,
                    printRequest: state.printRequest,
                    // In Preview mode text changes come only from disk, which ExternalChangeMonitor already debounces.
                    renderDebounce: state.isSourceVisible ? Self.editRenderDebounce : .zero,
                    didRender: didRender, linkActivated: linkActivated, scrollSync: scrollSync
                )
                .frame(minWidth: Self.paneMinWidth, maxWidth: .infinity)
            }
        }
        .overlay(alignment: .bottom) {
            if let missing = state.missingLinkTarget {
                MissingLinkTargetNotice(fileName: missing.fileName)
            }
        }
        // A new notice cancels this task and restarts the 3 s (#23).
        .task(id: state.missingLinkTarget) {
            guard state.missingLinkTarget != nil else { return }
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            state.missingLinkTarget = nil
        }
        .frame(minWidth: 480, minHeight: 320)
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
