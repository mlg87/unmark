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

/// What the Preview's web view does with a navigation it's asked to make (unmark-eg8).
public enum PreviewNavigation: Equatable, Sendable {
    /// The web view loads it.
    case load
    /// The web view stays where it is, and the URL goes where `LinkRouter.route` sends it.
    case followLink(URL)
}

extension LinkRouter {
    /// Decides a navigation to `url`. The Preview's main frame only ever loads the renderer, so any other URL it's
    /// asked to load is a link the user followed. A click is one, and so is Open Link in the context menu or a file
    /// dropped on the Preview, which WebKit doesn't report as clicks. Left alone, those would replace the document
    /// with the link's target.
    public static func navigation(to url: URL, isLinkClick: Bool, inMainFrame: Bool) -> PreviewNavigation {
        if isLinkClick {
            return .followLink(url)
        }
        guard inMainFrame else { return .load }
        if case .renderer = PreviewURL.resource(for: url) {
            return .load
        }
        return .followLink(url)
    }
}
