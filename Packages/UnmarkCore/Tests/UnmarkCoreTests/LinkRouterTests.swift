import Foundation
import Testing
import UnmarkCore

struct LinkRouterTests {
    private static let document = URL(fileURLWithPath: "/repo/docs/My Notes/README.md")
    /// Files that exist for these tests; everything else is missing.
    private static let existing: Set<String> = [
        "/repo/docs/My Notes/README.md",
        "/repo/docs/My Notes/other.md",
        "/repo/docs/My Notes/other.markdown",
        "/repo/docs/My Notes/image.png",
        "/repo/docs/x/other.md",
        "/repo/docs/My Notes/café 📝.md",
        "/repo/docs/My Notes/sub/",
    ]

    /// `href` resolved the way WebKit resolves it against the document's `<base href>`.
    private static func route(_ href: String) throws -> LinkDestination {
        let base = PreviewURL.documentBaseURL(forDocumentAt: document)
        let url = try #require(URL(string: href, relativeTo: base)?.absoluteURL)
        return LinkRouter.route(url: url, documentURL: document) { existing.contains($0.path(percentEncoded: false)) }
    }

    private static func file(_ path: String) -> URL {
        URL(fileURLWithPath: path).standardizedFileURL
    }

    @Test func fragmentOnlyLinkIsAnAnchor() throws {
        #expect(try Self.route("#a") == .anchor("a"))
    }

    @Test func linkToTheDocumentItselfWithAFragmentIsAnAnchor() throws {
        #expect(try Self.route("README.md#usage") == .anchor("usage"))
    }

    @Test func anchorIsPercentDecoded() throws {
        #expect(try Self.route("#caf%C3%A9-%F0%9F%93%9D") == .anchor("café-📝"))
    }

    @Test func relativeMarkdownFileOpensInUnmark() throws {
        #expect(try Self.route("other.md") == .markdownFile(Self.file("/repo/docs/My Notes/other.md"), fragment: nil))
    }

    @Test func parentRelativeMarkdownFileKeepsItsFragment() throws {
        #expect(
            try Self.route("../x/other.md#sec") == .markdownFile(Self.file("/repo/docs/x/other.md"), fragment: "sec"))
    }

    @Test func everyMarkdownExtensionOpensInUnmark() throws {
        #expect(
            try Self.route("other.markdown")
                == .markdownFile(Self.file("/repo/docs/My Notes/other.markdown"), fragment: nil))
    }

    @Test func percentEncodedFileNameIsDecoded() throws {
        #expect(
            try Self.route("caf%C3%A9%20%F0%9F%93%9D.md#top")
                == .markdownFile(Self.file("/repo/docs/My Notes/café 📝.md"), fragment: "top"))
    }

    @Test func emptyFragmentIsDropped() throws {
        #expect(try Self.route("other.md#") == .markdownFile(Self.file("/repo/docs/My Notes/other.md"), fragment: nil))
    }

    @Test(arguments: ["https://x", "http://example.com/a.md", "mailto:me@example.com"])
    func webAndMailLinksAreExternal(href: String) throws {
        #expect(try Self.route(href) == .external(try #require(URL(string: href))))
    }

    @Test func nonMarkdownFileOpensInTheDefaultApp() throws {
        #expect(try Self.route("image.png") == .external(Self.file("/repo/docs/My Notes/image.png")))
    }

    @Test func folderOpensInTheDefaultApp() throws {
        #expect(try Self.route("sub/") == .external(Self.file("/repo/docs/My Notes/sub/")))
    }

    @Test func missingMarkdownFileIsMissing() throws {
        #expect(try Self.route("gone.md#sec") == .missingFile(Self.file("/repo/docs/My Notes/gone.md")))
    }

    @Test func missingNonMarkdownFileIsMissing() throws {
        #expect(try Self.route("gone.png") == .missingFile(Self.file("/repo/docs/My Notes/gone.png")))
    }

    @Test func rootRelativeLinkIsMissing() throws {
        let url = try #require(URL(string: "unmark://app/docs/a.md"))
        #expect(try Self.route("/docs/a.md") == .missingFile(url))
    }

    @Test func defaultFileCheckReadsTheDisk() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let document = directory.appending(path: "README.md")
        let other = directory.appending(path: "other.md")
        try Data().write(to: other)
        let base = PreviewURL.documentBaseURL(forDocumentAt: document)

        let present = try #require(URL(string: "other.md", relativeTo: base)?.absoluteURL)
        let absent = try #require(URL(string: "absent.md", relativeTo: base)?.absoluteURL)
        #expect(
            LinkRouter.route(url: present, documentURL: document)
                == .markdownFile(other.standardizedFileURL, fragment: nil))
        #expect(
            LinkRouter.route(url: absent, documentURL: document)
                == .missingFile(directory.appending(path: "absent.md").standardizedFileURL))
    }

    // MARK: Navigations the Preview's web view is asked to make

    /// A link as WebKit resolves it against the document's `<base href>`.
    private static func resolved(_ href: String) throws -> URL {
        let base = PreviewURL.documentBaseURL(forDocumentAt: document)
        return try #require(URL(string: href, relativeTo: base)?.absoluteURL)
    }

    @Test func rendererPageLoads() {
        #expect(LinkRouter.navigation(to: PreviewURL.rendererPage, isLinkClick: false, inMainFrame: true) == .load)
    }

    @Test(arguments: ["other.md", "other.md#sec", "image.png", "https://example.com/", "mailto:me@example.com"])
    func clickedLinkIsFollowed(href: String) throws {
        let url = try Self.resolved(href)
        #expect(LinkRouter.navigation(to: url, isLinkClick: true, inMainFrame: true) == .followLink(url))
    }

    /// Open Link in the context menu navigates without a click.
    @Test(arguments: ["other.md", "other.md#sec", "image.png", "https://example.com/", "mailto:me@example.com"])
    func linkFollowedWithoutAClickIsFollowed(href: String) throws {
        let url = try Self.resolved(href)
        #expect(LinkRouter.navigation(to: url, isLinkClick: false, inMainFrame: true) == .followLink(url))
    }

    @Test func fileDroppedOnThePreviewIsFollowed() {
        let url = URL(fileURLWithPath: "/repo/docs/My Notes/other.md")
        #expect(LinkRouter.navigation(to: url, isLinkClick: false, inMainFrame: true) == .followLink(url))
    }

    /// A relative link can climb out of `doc/` to the renderer's own page. Clicked, it's still a link.
    @Test func clickedLinkToTheRendererPageIsFollowed() {
        let url = PreviewURL.rendererPage
        #expect(LinkRouter.navigation(to: url, isLinkClick: true, inMainFrame: true) == .followLink(url))
    }

    @Test func subframeLoads() throws {
        let url = try #require(URL(string: "https://example.com/"))
        #expect(LinkRouter.navigation(to: url, isLinkClick: false, inMainFrame: false) == .load)
    }

    @Test func clickedLinkInASubframeIsFollowed() throws {
        let url = try #require(URL(string: "https://example.com/"))
        #expect(LinkRouter.navigation(to: url, isLinkClick: true, inMainFrame: false) == .followLink(url))
    }
}
