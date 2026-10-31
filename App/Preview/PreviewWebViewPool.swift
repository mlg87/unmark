import UnmarkCore
import WebKit
import os

/// Keeps one spare Preview web view with the renderer page already loaded, so opening a file doesn't wait for a
/// WebContent process to launch and the page to load: about 0.3 s of the 1 s open-to-preview budget (q47). The
/// app prepares the first spare at launch, and a Preview prepares the next after it renders, so making the spare
/// never competes with the open it's meant to speed up.
@MainActor
final class PreviewWebViewPool: NSObject, WKNavigationDelegate {
    static let shared = PreviewWebViewPool()

    private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "PreviewWebViewPool")

    private var spare: WKWebView?
    private var spareLoaded = false

    /// Starts loading a spare web view, unless one exists.
    func prepare() {
        guard spare == nil else { return }
        let webView = Self.makeWebView()
        webView.navigationDelegate = self
        spare = webView
        spareLoaded = false
        webView.load(URLRequest(url: PreviewURL.rendererPage))
    }

    /// The spare web view, or a new one when there's none. `pageLoaded` is false while the renderer page is still
    /// loading; the caller becomes the navigation delegate and gets its `didFinish`.
    func take() -> (webView: WKWebView, pageLoaded: Bool) {
        guard let webView = spare else {
            let webView = Self.makeWebView()
            webView.load(URLRequest(url: PreviewURL.rendererPage))
            return (webView, false)
        }
        let pageLoaded = spareLoaded
        spare = nil
        spareLoaded = false
        return (webView, pageLoaded)
    }

    private static func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(UnmarkSchemeHandler(), forURLScheme: PreviewURL.scheme)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        #if DEBUG
            // Lets Safari's Develop menu attach the Web Inspector to the Preview.
            webView.isInspectable = true
        #endif
        return webView
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === spare { spareLoaded = true }
    }

    func webView(
        _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error
    ) {
        Self.logger.error("Spare renderer page failed to load: \(error.localizedDescription, privacy: .public)")
        if webView === spare { spare = nil }
    }

    /// A spare whose WebContent process exited can't render; the next open makes a fresh one instead.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === spare { spare = nil }
    }
}
