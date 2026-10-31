import Foundation
import Testing
import UnmarkCore

struct PreviewURLTests {
    @Test(arguments: [
        "/Users/me/notes/README.md",
        "/Users/me/My Notes/README.md",
        "/tmp/100% done #1?/README.md",
        "/tmp/café 📝/README.md",
    ])
    func relativeImageResolvesNextToTheDocument(documentPath: String) throws {
        let base = PreviewURL.documentBaseURL(forDocumentAt: URL(fileURLWithPath: documentPath))
        let image = try #require(URL(string: "img/a%20b.png", relativeTo: base)?.absoluteURL)

        let directory = (documentPath as NSString).deletingLastPathComponent
        #expect(PreviewURL.resource(for: image) == .document(fileURL: URL(fileURLWithPath: "\(directory)/img/a b.png")))
    }

    @Test func parentRelativePathResolvesToTheParentFolder() throws {
        let base = PreviewURL.documentBaseURL(forDocumentAt: URL(fileURLWithPath: "/repo/docs/guide.md"))
        let image = try #require(URL(string: "../assets/logo.svg", relativeTo: base)?.absoluteURL)

        #expect(PreviewURL.resource(for: image) == .document(fileURL: URL(fileURLWithPath: "/repo/assets/logo.svg")))
    }

    @Test func baseURLEndsInASlashSoItNamesTheDirectory() {
        let base = PreviewURL.documentBaseURL(forDocumentAt: URL(fileURLWithPath: "/repo/README.md"))
        #expect(base.absoluteString == "unmark://app/doc/repo/")
    }

    @Test func rendererPageIsARendererResource() {
        #expect(PreviewURL.resource(for: PreviewURL.rendererPage) == .renderer(path: "index.html"))
    }

    @Test func nestedRendererPathIsKept() throws {
        let url = try #require(URL(string: "unmark://app/renderer/fonts/KaTeX_Main-Regular.woff2"))
        #expect(PreviewURL.resource(for: url) == .renderer(path: "fonts/KaTeX_Main-Regular.woff2"))
    }

    @Test(arguments: [
        "unmark://app/renderer/%2E%2E/%2E%2E/Info.plist",
        "unmark://app/renderer/fonts/%2E%2E/%2E%2E/MacOS/Unmark",
        "unmark://app/renderer/",
        "unmark://app/renderer//index.html",
        "unmark://other/renderer/index.html",
        "https://app/renderer/index.html",
        "unmark://app/elsewhere/index.html",
        "unmark://app/document/etc/hosts",
        "unmark://app/doc/",
        "unmark://app/doc/Users/me/",
    ])
    func rejectsURLsOutsideTheTwoRoutes(string: String) throws {
        let url = try #require(URL(string: string))
        #expect(PreviewURL.resource(for: url) == nil)
    }

    @Test(arguments: [
        ("html", "text/html"),
        ("js", "text/javascript"),
        ("css", "text/css"),
        ("woff2", "font/woff2"),
        ("PNG", "image/png"),
        ("jpeg", "image/jpeg"),
        ("svg", "image/svg+xml"),
        ("unknown", "application/octet-stream"),
    ])
    func mimeTypeMatchesExtension(pathExtension: String, mimeType: String) {
        #expect(PreviewURL.mimeType(forPathExtension: pathExtension) == mimeType)
    }
}
