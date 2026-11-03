import AppKit
import WebKit

/// The Preview pane: the find bar, while it's open, above the web view. A plain view around the stack, so SwiftUI sizes
/// the pane to its proposal as it does a bare web view.
final class PreviewPaneView: NSView {
    let findBar: PreviewFindBar

    init(webView: WKWebView) {
        findBar = PreviewFindBar(webView: webView)
        super.init(frame: .zero)
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
