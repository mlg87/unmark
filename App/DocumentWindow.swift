import SwiftUI

/// A document window's content. Every window opens in Preview mode (q15).
struct DocumentWindow: View {
    let text: String
    let documentBaseURL: URL
    let didRender: @MainActor () -> Void

    var body: some View {
        PreviewView(markdown: text, documentBaseURL: documentBaseURL, didRender: didRender)
            .frame(minWidth: 480, minHeight: 320)
    }
}
