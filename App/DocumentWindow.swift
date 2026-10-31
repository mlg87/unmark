import SwiftUI

/// A document window's content. Every window opens in Preview mode (q15).
struct DocumentWindow: View {
    let state: DocumentState
    let didRender: @MainActor () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if state.fileWasDeleted {
                FileDeletedBanner()
                Divider()
            }
            PreviewView(markdown: state.text, documentBaseURL: state.documentBaseURL, didRender: didRender)
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
