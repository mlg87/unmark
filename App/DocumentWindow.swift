import SwiftUI

/// A document window's content. Every window opens in Preview mode (q15).
struct DocumentWindow: View {
    let text: String

    var body: some View {
        PreviewPlaceholder(text: text)
            .frame(minWidth: 480, minHeight: 320)
    }
}

/// Stands in for the rendered Preview until the WKWebView Preview lands (#22): shows the markdown unrendered.
private struct PreviewPlaceholder: View {
    let text: String

    var body: some View {
        ScrollView {
            Text(verbatim: text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
        }
    }
}
