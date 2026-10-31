import Foundation
import Testing
import UnmarkCore

struct MarkdownFileTests {
    @Test(arguments: ["README.md", "notes.markdown", "draft.mdown", "wiki.mdwn", "a.mkd", "b.mkdn", "c.mkdown"])
    func recognizesMarkdownExtensions(fileName: String) {
        #expect(MarkdownFile.isMarkdown(URL(fileURLWithPath: "/tmp/\(fileName)")))
    }

    @Test(arguments: ["README.MD", "Notes.Markdown"])
    func ignoresExtensionCase(fileName: String) {
        #expect(MarkdownFile.isMarkdown(URL(fileURLWithPath: "/tmp/\(fileName)")))
    }

    @Test(arguments: ["notes.txt", "md", "Makefile", "archive.md.zip", ".md/notes"])
    func rejectsOtherFiles(path: String) {
        #expect(!MarkdownFile.isMarkdown(URL(fileURLWithPath: "/tmp/\(path)")))
    }
}
