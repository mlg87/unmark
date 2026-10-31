import Foundation
import Testing
import UnmarkCore

struct PendingDocumentsTests {
    private let start = ContinuousClock.now

    @Test func closingEveryPathEmptiesTheSet() {
        var pending = PendingDocuments(paths: ["/a.md", "/b.md"])
        pending.documentClosed("/a.md")
        #expect(!pending.isEmpty)
        pending.documentClosed("/b.md")
        #expect(pending.isEmpty)
    }

    @Test func ignoresClosesOfOtherPaths() {
        var pending = PendingDocuments(paths: ["/a.md"])
        pending.documentClosed("/other.md")
        #expect(pending.paths == ["/a.md"])
    }

    // The query can reach the app before the open request does.
    @Test func keepsAPathNoReplyHasListedYet() {
        var pending = PendingDocuments(paths: ["/a.md"])
        pending.reconcile(openPaths: [], at: start)
        pending.reconcile(openPaths: [], at: start + .seconds(9))
        #expect(pending.paths == ["/a.md"])
    }

    // Recovers a dropped `documentClosed`.
    @Test func dropsAPathOnceAReplyThatListedItNoLongerDoes() {
        var pending = PendingDocuments(paths: ["/a.md", "/b.md"])
        pending.reconcile(openPaths: ["/a.md", "/b.md"], at: start)
        pending.reconcile(openPaths: ["/b.md", "/unrelated.md"], at: start + .seconds(2))
        #expect(pending.paths == ["/b.md"])
    }

    // A file the app failed to open never gets a window to close.
    @Test func dropsAnUnlistedPathAfterTheGracePeriod() {
        var pending = PendingDocuments(paths: ["/a.md", "/b.md"])
        pending.reconcile(openPaths: ["/b.md"], at: start)
        pending.reconcile(openPaths: ["/b.md"], at: start + PendingDocuments.openGracePeriod)
        #expect(pending.paths == ["/b.md"])
    }

    @Test func gracePeriodStartsAtTheFirstReply() {
        var pending = PendingDocuments(paths: ["/a.md"])
        let firstReply = start + .seconds(30)
        pending.reconcile(openPaths: [], at: firstReply)
        pending.reconcile(openPaths: [], at: firstReply + .seconds(9))
        #expect(pending.paths == ["/a.md"])
    }
}

struct DocumentWaitMessageTests {
    @Test func parsesPayloadsFromTheAppItOpened() {
        let closed = DocumentWaitMessage.documentClosedUserInfo(path: "/a.md", pid: 42)
        #expect(DocumentWaitMessage.closedPath(in: closed, from: 42) == "/a.md")
        let open = DocumentWaitMessage.openPathsUserInfo(paths: ["/a.md", "/b.md"], pid: 42)
        #expect(DocumentWaitMessage.openPaths(in: open, from: 42) == ["/a.md", "/b.md"])
    }

    // Another running copy of Unmark, such as a dev build, doesn't have this run's documents open.
    @Test func ignoresPayloadsFromOtherProcesses() {
        let closed = DocumentWaitMessage.documentClosedUserInfo(path: "/a.md", pid: 7)
        #expect(DocumentWaitMessage.closedPath(in: closed, from: 42) == nil)
        let open = DocumentWaitMessage.openPathsUserInfo(paths: [], pid: 7)
        #expect(DocumentWaitMessage.openPaths(in: open, from: 42) == nil)
    }

    // Any process can post these names.
    @Test func rejectsMalformedPayloads() {
        #expect(DocumentWaitMessage.closedPath(in: nil, from: 42) == nil)
        #expect(DocumentWaitMessage.closedPath(in: ["path": 1, "pid": 42], from: 42) == nil)
        #expect(DocumentWaitMessage.closedPath(in: ["path": "/a.md", "pid": "42"], from: 42) == nil)
        #expect(DocumentWaitMessage.openPaths(in: ["paths": "/a.md", "pid": 42], from: 42) == nil)
        #expect(DocumentWaitMessage.openPaths(in: ["paths": ["/a.md", 1], "pid": 42], from: 42) == nil)
    }

    @Test func canonicalPathNamesASymlinkedFileByItsTarget() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appending(path: "a.md")
        try Data().write(to: file)
        let link = directory.appending(path: "link.md")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)

        let dotted = URL(fileURLWithPath: directory.path + "/./sub/../link.md")
        #expect(DocumentWaitMessage.canonicalPath(of: dotted) == DocumentWaitMessage.canonicalPath(of: file))
    }
}
