import SwiftUI
import UnmarkCore
import WebKit
import os

/// The rendered document: the renderer bundle in a WKWebView, served by `UnmarkSchemeHandler` (#22). The page follows
/// the system appearance through `prefers-color-scheme` (q8).
struct PreviewView: NSViewRepresentable {
    let markdown: String
    /// Where the document's relative images and links resolve; see `PreviewURL.documentBaseURL(forDocumentAt:)`.
    let documentBaseURL: URL
    /// The element to scroll to once the current text has rendered.
    let scrollRequest: ScrollRequest?
    /// Called after each render reaches the page.
    let didRender: @MainActor () -> Void
    /// Called with a clicked link's URL, resolved against `documentBaseURL`. The Preview itself never navigates
    /// away from the renderer page (#23).
    let linkActivated: @MainActor (URL) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(UnmarkSchemeHandler(), forURLScheme: PreviewURL.scheme)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        #if DEBUG
            // Lets Safari's Develop menu attach the Web Inspector to the Preview.
            webView.isInspectable = true
        #endif
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView
        webView.load(URLRequest(url: PreviewURL.rendererPage))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.didRender = didRender
        context.coordinator.linkActivated = linkActivated
        // After `render`, so a request that arrives with new text waits for that text to render.
        context.coordinator.render(RenderRequest(markdown: markdown, documentBaseURL: documentBaseURL))
        context.coordinator.scroll(to: scrollRequest)
    }

    struct RenderRequest: Equatable {
        let markdown: String
        let documentBaseURL: URL
    }

    /// Queues renders until the renderer page has loaded, then runs them one at a time. Only the newest waiting
    /// request is kept, so a burst of text changes costs at most one render after the current one. A scroll waits
    /// until no render is running or waiting, so it finds the element it names.
    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "PreviewView")
        /// One `render` interval per render in Points of Interest, so Instruments counts the renders a burst of
        /// file changes costs (#24).
        private static let signposter = OSSignposter(subsystem: "com.mlg87.unmark", category: .pointsOfInterest)

        weak var webView: WKWebView?
        var didRender: @MainActor () -> Void = {}
        var linkActivated: @MainActor (URL) -> Void = { _ in }

        private var pageLoaded = false
        private var isRendering = false
        private var waiting: RenderRequest?
        /// The last request handed to the renderer, so SwiftUI updates that don't change the text don't re-render.
        private var latest: RenderRequest?
        private var pendingScroll: ScrollRequest?
        /// The last scroll request seen, so SwiftUI updates that don't change it don't scroll again.
        private var latestScroll: ScrollRequest?

        func render(_ request: RenderRequest) {
            guard request != latest else { return }
            latest = request
            waiting = request
            renderNextIfReady()
        }

        func scroll(to request: ScrollRequest?) {
            guard let request, request != latestScroll else { return }
            latestScroll = request
            pendingScroll = request
            renderNextIfReady()
        }

        /// Cancels every link click, so the page never leaves the renderer, and hands the URL to `linkActivated`.
        /// The handler is called before anything else, because WebKit requires it to be called exactly once.
        func webView(
            _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            linkActivated(url)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            pageLoaded = true
            renderNextIfReady()
        }

        func webView(
            _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error
        ) {
            Self.logger.error("Renderer page failed to load: \(error.localizedDescription, privacy: .public)")
        }

        private func renderNextIfReady() {
            guard pageLoaded, !isRendering, let webView else { return }
            guard let request = waiting else {
                scrollToPendingElement(in: webView)
                return
            }
            waiting = nil
            isRendering = true
            let interval = Self.signposter.beginInterval("render", id: Self.signposter.makeSignpostID())
            Task {
                do {
                    // `callAsyncJavaScript` passes the text as an argument, so it needs no escaping, and awaits the
                    // promise `render` returns. WebKit can report the page loaded before the page's module script
                    // has run; importing that same module waits for it to finish instead of finding no
                    // `window.unmark`.
                    _ = try await webView.callAsyncJavaScript(
                        """
                        await import(rendererScript);
                        await window.unmark.render(markdown, { documentBaseURL });
                        """,
                        arguments: [
                            "rendererScript": PreviewURL.rendererScript.absoluteString,
                            "markdown": request.markdown,
                            "documentBaseURL": request.documentBaseURL.absoluteString,
                        ],
                        contentWorld: .page)
                    didRender()
                } catch {
                    // The description carries WebKit's WKJavaScriptExceptionMessage, which names the cause.
                    Self.logger.error("Render failed: \(String(describing: error), privacy: .public)")
                }
                Self.signposter.endInterval("render", interval)
                isRendering = false
                renderNextIfReady()
            }
        }

        private func scrollToPendingElement(in webView: WKWebView) {
            // Nothing has been rendered yet; `render` always arrives first, so this only waits for the page load.
            guard latest != nil, let request = pendingScroll else { return }
            pendingScroll = nil
            Task {
                do {
                    _ = try await webView.callAsyncJavaScript(
                        "document.getElementById(elementID)?.scrollIntoView();",
                        arguments: ["elementID": request.elementID], contentWorld: .page)
                } catch {
                    Self.logger.error("Scroll failed: \(String(describing: error), privacy: .public)")
                }
            }
        }
    }
}
