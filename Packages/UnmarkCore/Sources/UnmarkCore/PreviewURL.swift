import Foundation

/// The `unmark://app/` URL space the Preview's web view loads from (#22). The renderer bundle and the files a
/// document references share this one origin because WebKit blocks ES-module `import()` from `file://` (ADR-0001),
/// and lazy chunks, KaTeX fonts, and relative images all need to load side by side.
public enum PreviewURL {
    public static let scheme = "unmark"
    public static let host = "app"

    /// The renderer's page, served from the app bundle's `Renderer/` folder.
    public static let rendererPage = URL(string: "unmark://app/renderer/index.html")!
    /// The page's module script, which defines `window.unmark`.
    public static let rendererScript = URL(string: "unmark://app/renderer/unmark.js")!

    public enum Resource: Equatable, Sendable {
        /// A file inside the bundled `Renderer/` folder, as a relative path with no `.` or `..` components.
        case renderer(path: String)
        /// A file on disk, which an unsandboxed app may read anywhere (ADR-0002).
        case document(fileURL: URL)
    }

    /// The base URL the renderer applies as `<base href>`, so relative images and links in the document at
    /// `fileURL` resolve to its directory: `unmark://app/doc/<percent-encoded absolute directory path>/`.
    public static func documentBaseURL(forDocumentAt fileURL: URL) -> URL {
        var directory = fileURL.deletingLastPathComponent().standardizedFileURL.path(percentEncoded: false)
        if !directory.hasSuffix("/") {
            directory += "/"
        }
        // `.urlPathAllowed` keeps `/` literal, which `<base href>` needs to resolve `../` against parent folders,
        // and encodes `%`, `?`, `#`, and spaces, which would otherwise end or alter the path.
        let encoded = directory.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? directory
        return URL(string: "\(scheme)://\(host)/doc\(encoded)")!
    }

    /// What a request URL refers to, or `nil` for anything outside the two routes, which the handler answers 404.
    public static func resource(for url: URL) -> Resource? {
        guard isAppURL(url) else { return nil }

        if let relative = url.path(percentEncoded: false).dropPrefix("/renderer/") {
            let components = relative.split(separator: "/", omittingEmptySubsequences: false)
            // WebKit removes dot segments before a request is sent, but a percent-encoded `%2E%2E` survives
            // until the path is decoded here and would otherwise reach outside the bundle.
            guard !components.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
            return .renderer(path: relative)
        }

        if let fileURL = documentItem(for: url), !fileURL.hasDirectoryPath {
            return .document(fileURL: fileURL)
        }
        return nil
    }

    /// The file or folder on disk that a `unmark://app/doc/` URL names, ignoring its query and fragment, or `nil`
    /// outside that route. Unlike `resource(for:)` this keeps folders (a trailing `/`), because a link such as `#top`
    /// resolves against the document's folder (#23).
    public static func documentItem(for url: URL) -> URL? {
        guard isAppURL(url), let absolute = url.path(percentEncoded: false).dropPrefix("/doc"),
            absolute.hasPrefix("/")
        else { return nil }
        return URL(fileURLWithPath: absolute, isDirectory: absolute.hasSuffix("/")).standardizedFileURL
    }

    private static func isAppURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == scheme && url.host(percentEncoded: false)?.lowercased() == host
    }

    /// The `Content-Type` for a served file. WebKit refuses module scripts and stylesheets with the wrong type,
    /// and font and image loads use it to pick a decoder.
    public static func mimeType(forPathExtension pathExtension: String) -> String {
        mimeTypes[pathExtension.lowercased()] ?? "application/octet-stream"
    }

    private static let mimeTypes: [String: String] = [
        "html": "text/html",
        "htm": "text/html",
        "js": "text/javascript",
        "mjs": "text/javascript",
        "css": "text/css",
        "json": "application/json",
        "map": "application/json",
        "woff2": "font/woff2",
        "woff": "font/woff",
        "ttf": "font/ttf",
        "otf": "font/otf",
        "png": "image/png",
        "apng": "image/apng",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "svg": "image/svg+xml",
        "webp": "image/webp",
        "avif": "image/avif",
        "bmp": "image/bmp",
        "ico": "image/x-icon",
        "tif": "image/tiff",
        "tiff": "image/tiff",
        "heic": "image/heic",
    ]
}

extension String {
    fileprivate func dropPrefix(_ prefix: String) -> String? {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : nil
    }
}
