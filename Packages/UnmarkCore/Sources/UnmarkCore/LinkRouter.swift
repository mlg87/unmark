import Foundation

/// Where a link clicked in the Preview goes (#23). Left alone, WebKit would navigate the Preview itself to the link
/// target, so every kind of link gets an intentional destination (epic #4, q18).
public enum LinkDestination: Equatable, Sendable {
    /// An element in the same document, such as a heading or footnote, by its percent-decoded `id`.
    case anchor(String)
    /// A markdown file on disk that Unmark opens, scrolled to the element whose `id` is `fragment`, if any.
    case markdownFile(URL, fragment: String?)
    /// A web or mail link, or a file or folder on disk that isn't markdown; the default app opens it.
    case external(URL)
    /// A file or folder the link names that doesn't exist.
    case missingFile(URL)
}

public enum LinkRouter {
    /// Routes `url`, a link as WebKit resolved it against the document's `<base href>`, from the document at the
    /// file URL `documentURL`. `fileExists` defaults to checking the disk; tests replace it.
    public static func route(
        url: URL,
        documentURL: URL,
        fileExists: (URL) -> Bool = { FileManager.default.fileExists(atPath: $0.path(percentEncoded: false)) }
    ) -> LinkDestination {
        guard url.scheme?.lowercased() == PreviewURL.scheme else { return .external(url) }
        // A root-relative link such as `/docs/a.md` resolves outside `unmark://app/doc/`. Without a repository
        // root there's nothing it could name.
        guard let item = PreviewURL.documentItem(for: url) else { return .missingFile(url) }

        let fragment = url.fragment(percentEncoded: false).flatMap { $0.isEmpty ? nil : $0 }
        let document = documentURL.standardizedFileURL
        // `#install` resolves against `<base href>`, the document's folder, rather than the document itself.
        if let fragment, item == document || item == document.deletingLastPathComponent() {
            return .anchor(fragment)
        }

        guard fileExists(item) else { return .missingFile(item) }
        if !item.hasDirectoryPath, MarkdownFile.isMarkdown(item) {
            return .markdownFile(item, fragment: fragment)
        }
        return .external(item)
    }
}
