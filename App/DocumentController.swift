import AppKit

/// Opens any file it's handed as markdown. `GIT_EDITOR="unmark --wait"` hands over `COMMIT_EDITMSG`, which has no
/// extension and so isn't `net.daringfireball.markdown`; without this, AppKit refuses it as the "data" format
/// (#37). The Open panel and Finder still offer only markdown files: they filter on Info.plist's document types.
final class DocumentController: NSDocumentController {
    /// Info.plist's `CFBundleDocumentTypes` entry for `MarkdownDocument`.
    private static let markdownTypeName = "net.daringfireball.markdown"

    override func typeForContents(of url: URL) throws -> String {
        let typeName = try super.typeForContents(of: url)
        return documentClass(forType: typeName) == nil ? Self.markdownTypeName : typeName
    }
}
