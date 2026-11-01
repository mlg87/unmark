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
    /// Prints the Preview once the current text has rendered (#34).
    let printRequest: PrintRequest?
    /// How long a text change waits for further changes before it renders. Zero renders at once.
    let renderDebounce: Duration
    /// Called with the rendered text after each render reaches the page.
    let didRender: @MainActor (String) -> Void
    /// Called with a clicked link's URL, resolved against `documentBaseURL`. The Preview itself never navigates
    /// away from the renderer page (#23).
    let linkActivated: @MainActor (URL) -> Void
    /// Keeps the Preview and, in Split mode, the Source on the same source line.
    let scrollSync: ScrollSync

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let (webView, pageLoaded) = PreviewWebViewPool.shared.take()
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView
        context.coordinator.pageLoaded = pageLoaded
        // The renderer posts `previewScrolled` to this handler as the user scrolls. WebKit looks handlers up when the
        // page posts, so one added after the pool loaded the page still receives them. The content controller keeps
        // the coordinator alive only as long as the web view, which is its own.
        webView.configuration.userContentController.add(context.coordinator, name: PreviewMessage.handlerName)
        scrollSync.scrollPreview = { [weak coordinator = context.coordinator] line in
            coordinator?.scrollToSourceLine(line)
        }
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.didRender = didRender
        context.coordinator.linkActivated = linkActivated
        context.coordinator.previewScrolled = { [scrollSync] line in
            scrollSync.paneDidScroll(.preview, toLine: line)
        }
        // After `render`, so a request that arrives with new text waits for that text to render.
        context.coordinator.render(
            RenderRequest(markdown: markdown, documentBaseURL: documentBaseURL), after: renderDebounce)
        context.coordinator.scroll(to: scrollRequest)
        context.coordinator.printPreview(printRequest)
    }

    struct RenderRequest: Equatable {
        let markdown: String
        let documentBaseURL: URL
    }

    /// The renderer's `OutputMode`.
    private enum OutputMode: String {
        case screen, print
    }

    /// Queues renders until the renderer page has loaded, then runs them one at a time. Only the newest waiting
    /// request is kept, so a burst of text changes costs at most one render after the current one. A debounced
    /// request also waits until no newer one has arrived for its delay. A scroll or print waits until no render is
    /// running or waiting, so it finds the element it names or prints the current text.
    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "PreviewView")
        /// One `render` interval per render in Points of Interest, so Instruments counts the renders a burst of
        /// file changes costs (#24).
        private static let signposter = OSSignposter(subsystem: "com.mlg87.unmark", category: .pointsOfInterest)

        weak var webView: WKWebView?
        var didRender: @MainActor (String) -> Void = { _ in }
        var linkActivated: @MainActor (URL) -> Void = { _ in }
        /// Called with the 0-based source line at the Preview's top as the user scrolls it.
        var previewScrolled: @MainActor (Double) -> Void = { _ in }

        /// Set by `makeNSView` when the pool hands over a web view whose page already loaded.
        var pageLoaded = false
        private var isRendering = false
        private var waiting: RenderRequest?
        /// Holds `waiting` back until the debounce delay passes with no newer request.
        private var debounce: Task<Void, Never>?
        /// The last request handed to the renderer, so SwiftUI updates that don't change the text don't re-render.
        private var latest: RenderRequest?
        private var pendingScroll: ScrollRequest?
        /// The last scroll request seen, so SwiftUI updates that don't change it don't scroll again.
        private var latestScroll: ScrollRequest?
        private var pendingPrint: PrintRequest?
        /// The last print request seen, so SwiftUI updates that don't change it don't print again.
        private var latestPrint: PrintRequest?
        /// Set from the switch to print output until the switch back, so a second Print… can't restore screen output
        /// under the first one's print panel.
        private var isPrinting = false
        /// The newest source line the Preview should follow the Source to, while an earlier one is still scrolling.
        private var pendingSourceLine: Double?
        private var isScrollingToSourceLine = false

        func render(_ request: RenderRequest, after delay: Duration) {
            guard request != latest else { return }
            latest = request
            waiting = request
            debounce?.cancel()
            debounce = nil
            if delay > .zero {
                debounce = Task { [weak self] in
                    try? await Task.sleep(for: delay)
                    guard !Task.isCancelled, let self else { return }
                    debounce = nil
                    renderNextIfReady()
                }
            }
            renderNextIfReady()
        }

        func scroll(to request: ScrollRequest?) {
            guard let request, request != latestScroll else { return }
            latestScroll = request
            pendingScroll = request
            renderNextIfReady()
        }

        func printPreview(_ request: PrintRequest?) {
            guard let request, request != latestPrint else { return }
            latestPrint = request
            pendingPrint = request
            renderNextIfReady()
        }

        /// Follows the Source to 0-based source `line`. Calls run one at a time and only the newest waiting line is
        /// kept, so a fast Source scroll never queues up behind the page.
        func scrollToSourceLine(_ line: Double) {
            pendingSourceLine = line
            guard pageLoaded, latest != nil, !isScrollingToSourceLine, let webView else { return }
            isScrollingToSourceLine = true
            Task {
                while let line = pendingSourceLine {
                    pendingSourceLine = nil
                    do {
                        // `window.unmark` is undefined until the first render has imported the renderer module.
                        _ = try await webView.callAsyncJavaScript(
                            "await window.unmark?.scrollToSourceLine(line);", arguments: ["line": line],
                            contentWorld: .page)
                    } catch {
                        Self.logger.error("Following the Source failed: \(String(describing: error), privacy: .public)")
                    }
                }
                isScrollingToSourceLine = false
            }
        }

        func userContentController(
            _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            guard case .previewScrolled(let line) = PreviewMessage(body: message.body) else { return }
            previewScrolled(line)
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
            guard pageLoaded, !isRendering, debounce == nil, let webView else { return }
            guard let request = waiting else {
                scrollToPendingElement(in: webView)
                printPendingRequest(in: webView)
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
                    // `window.unmark`. The import costs about 40 ms even when the module already ran, so it's
                    // skipped then (q47).
                    _ = try await webView.callAsyncJavaScript(
                        """
                        if (!window.unmark) await import(rendererScript);
                        await window.unmark.render(markdown, { documentBaseURL });
                        """,
                        arguments: [
                            "rendererScript": PreviewURL.rendererScript.absoluteString,
                            "markdown": request.markdown,
                            "documentBaseURL": request.documentBaseURL.absoluteString,
                        ],
                        contentWorld: .page)
                    didRender(request.markdown)
                } catch {
                    // The description carries WebKit's WKJavaScriptExceptionMessage, which names the cause.
                    Self.logger.error("Render failed: \(String(describing: error), privacy: .public)")
                }
                Self.signposter.endInterval("render", interval)
                isRendering = false
                // After the render, so making the next window's web view doesn't slow this one's (q47).
                PreviewWebViewPool.shared.prepare()
                renderNextIfReady()
            }
        }

        private func scrollToPendingElement(in webView: WKWebView) {
            // Nothing has been rendered yet; `render` always arrives first, so this only waits for the page load.
            guard latest != nil, let request = pendingScroll else { return }
            pendingScroll = nil
            Task {
                do {
                    // The renderer waits for the element when it's in blocks still being inserted (q47).
                    _ = try await webView.callAsyncJavaScript(
                        "await window.unmark.scrollToElement(elementID);",
                        arguments: ["elementID": request.elementID], contentWorld: .page)
                } catch {
                    Self.logger.error("Scroll failed: \(String(describing: error), privacy: .public)")
                }
            }
        }

        /// Prints in print output, GitHub's light theme in either appearance (q61), and switches back to screen
        /// output once the print panel or the PDF export closes, whether it printed or was cancelled.
        private func printPendingRequest(in webView: WKWebView) {
            guard latest != nil, let request = pendingPrint else { return }
            pendingPrint = nil
            guard !isPrinting, let window = webView.window else { return }
            isPrinting = true
            Task {
                await setOutputMode(.print, in: webView)
                let operation = printOperation(for: request.destination, in: webView)
                // WKWebView hands back a print view with a zero frame, which prints blank pages.
                operation.view?.frame = webView.bounds
                operation.runModal(
                    for: window, delegate: self, didRun: #selector(printOperationDidRun(_:success:contextInfo:)),
                    contextInfo: nil)
            }
        }

        /// Both destinations use the paper size from Page Setup, which edits `NSPrintInfo.shared`.
        private func printOperation(for destination: PrintRequest.Destination, in webView: WKWebView)
            -> NSPrintOperation
        {
            switch destination {
            case .printPanel:
                return webView.printOperation(with: NSPrintInfo.shared)
            case .pdf(let url):
                // A copy, so the save disposition doesn't leak into the next Print….
                let printInfo = NSPrintInfo.shared.copy() as? NSPrintInfo ?? NSPrintInfo()
                printInfo.jobDisposition = .save
                printInfo.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = url
                let operation = webView.printOperation(with: printInfo)
                operation.showsPrintPanel = false
                operation.showsProgressPanel = true
                return operation
            }
        }

        @objc private func printOperationDidRun(
            _ operation: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?
        ) {
            Task {
                if let webView {
                    await setOutputMode(.screen, in: webView)
                }
                isPrinting = false
            }
        }

        private func setOutputMode(_ mode: OutputMode, in webView: WKWebView) async {
            do {
                // Print output resolves once the whole document is on the page in the light theme.
                _ = try await webView.callAsyncJavaScript(
                    "await window.unmark.setOutputMode(mode);", arguments: ["mode": mode.rawValue],
                    contentWorld: .page)
            } catch {
                Self.logger.error("Output mode switch failed: \(String(describing: error), privacy: .public)")
            }
        }
    }
}
