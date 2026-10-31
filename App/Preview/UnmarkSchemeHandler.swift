import Foundation
import UnmarkCore
import WebKit
import os

/// Serves `unmark://app/` to the Preview's web view (#22): the bundled renderer under `renderer/`, and files on disk
/// under `doc/`. `PreviewURL` defines the routes.
@MainActor
final class UnmarkSchemeHandler: NSObject, WKURLSchemeHandler {
    private static let logger = Logger(subsystem: "com.mlg87.unmark", category: "UnmarkSchemeHandler")

    /// `App/Resources/Renderer/`, which the build adds as a folder reference so its layout survives. Every app
    /// bundle has a resource directory.
    private let rendererDirectory = Bundle.main.resourceURL!.appending(path: "Renderer", directoryHint: .isDirectory)

    /// Tasks WebKit hasn't stopped. Files are read off the main actor, and WebKit may stop a task meanwhile (the
    /// page navigated or closed); responding to a stopped task raises an Objective-C exception.
    private var activeTasks = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let id = ObjectIdentifier(urlSchemeTask)
        activeTasks.insert(id)
        let fileURL = PreviewURL.resource(for: url).map(fileURL(for:))
        Task {
            let data = await Self.contents(of: fileURL)
            guard activeTasks.remove(id) != nil else { return }
            Self.respond(to: urlSchemeTask, url: url, fileURL: fileURL, data: data)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        activeTasks.remove(ObjectIdentifier(urlSchemeTask))
    }

    private func fileURL(for resource: PreviewURL.Resource) -> URL {
        switch resource {
        case .renderer(let path): rendererDirectory.appending(path: path, directoryHint: .notDirectory)
        case .document(let fileURL): fileURL
        }
    }

    /// Runs off the main actor, so reading a large image doesn't stall the window.
    nonisolated private static func contents(of fileURL: URL?) async -> Data? {
        guard let fileURL else { return nil }
        return try? Data(contentsOf: fileURL, options: .mappedIfSafe)
    }

    private static func respond(to task: any WKURLSchemeTask, url: URL, fileURL: URL?, data: Data?) {
        guard let fileURL, let data else {
            // A document can reference a missing image; WebKit shows its usual broken-image state for a 404.
            logger.info("404 for \(url.absoluteString, privacy: .private)")
            task.didReceive(httpResponse(url: url, status: 404, mimeType: "text/plain", length: 0))
            task.didFinish()
            return
        }
        let mimeType = PreviewURL.mimeType(forPathExtension: fileURL.pathExtension)
        task.didReceive(httpResponse(url: url, status: 200, mimeType: mimeType, length: data.count))
        task.didReceive(data)
        task.didFinish()
    }

    private static func httpResponse(url: URL, status: Int, mimeType: String, length: Int) -> HTTPURLResponse {
        // Only fails for a malformed HTTP version string.
        HTTPURLResponse(
            url: url, statusCode: status, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": mimeType, "Content-Length": String(length)])!
    }
}
