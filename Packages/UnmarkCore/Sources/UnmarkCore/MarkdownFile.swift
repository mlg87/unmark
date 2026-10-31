import Foundation

public enum MarkdownFile {
    /// Lowercased extensions of files Unmark opens as markdown: the common ones from
    /// GitHub Linguist's Markdown language, since Unmark renders the way GitHub does.
    public static let pathExtensions: Set<String> = [
        "md", "markdown", "mdown", "mdwn", "mkd", "mkdn", "mkdown"
    ]

    public static func isMarkdown(_ url: URL) -> Bool {
        pathExtensions.contains(url.pathExtension.lowercased())
    }
}
