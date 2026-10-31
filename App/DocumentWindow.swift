import SwiftUI

/// A document window's content. Every window opens in Preview mode (q15).
struct DocumentWindow: View {
    let state: DocumentState
    let didRender: @MainActor () -> Void
    let linkActivated: @MainActor (URL) -> Void

    var body: some View {
        VStack(spacing: 0) {
            if state.fileWasDeleted {
                FileDeletedBanner()
                Divider()
            }
            PreviewView(
                markdown: state.text, documentBaseURL: state.documentBaseURL, scrollRequest: state.scrollRequest,
                printRequest: state.printRequest, didRender: didRender, linkActivated: linkActivated)
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
