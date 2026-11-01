import Foundation
import Testing
import UnmarkCore

struct PendingDocumentsTests {
    private let openedAt = ContinuousClock.now

    @Test func closingEveryPathEmptiesTheSet() {
        var pending = PendingDocuments(paths: ["/a.md", "/b.md"], openedAt: openedAt)
        pending.documentClosed("/a.md")
        #expect(!pending.isEmpty)
        pending.documentClosed("/b.md")
        #expect(pending.isEmpty)
    }

    @Test func ignoresClosesOfOtherPaths() {
        var pending = PendingDocuments(paths: ["/a.md"], openedAt: openedAt)
        pending.documentClosed("/other.md")
        #expect(pending.paths == ["/a.md"])
    }

    // The query can reach the app before the open request does.
    @Test func keepsAPathNoReplyHasListedYet() {
        var pending = PendingDocuments(paths: ["/a.md"], openedAt: openedAt)
        #expect(pending.reconcile(openPaths: [], at: openedAt).isEmpty)
        #expect(pending.reconcile(openPaths: [], at: openedAt + .seconds(9)).isEmpty)
        #expect(pending.paths == ["/a.md"])
    }

    // Recovers a dropped `documentClosed`; a closed window isn't a failed open, however late.
    @Test func dropsAPathOnceAReplyThatListedItNoLongerDoes() {
        var pending = PendingDocuments(paths: ["/a.md", "/b.md"], openedAt: openedAt)
        _ = pending.reconcile(openPaths: ["/a.md", "/b.md"], at: openedAt)
        let failed = pending.reconcile(openPaths: ["/b.md", "/unrelated.md"], at: openedAt + .seconds(20))
        #expect(failed.isEmpty)
        #expect(pending.paths == ["/b.md"])
    }

    // A file the app failed to open never gets a window to close.
    @Test func reportsAnUnlistedPathAsFailedAfterTheOpenGracePeriod() {
        var pending = PendingDocuments(paths: ["/a.md", "/b.md"], openedAt: openedAt)
        _ = pending.reconcile(openPaths: ["/b.md"], at: openedAt)
        let failed = pending.reconcile(openPaths: ["/b.md"], at: openedAt + PendingDocuments.openGracePeriod)
        #expect(failed == ["/a.md"])
        #expect(pending.paths == ["/b.md"])
    }

    // The app answers nothing while its can't-open alert is up, so the grace period can't wait for a first reply.
    @Test func openGracePeriodStartsAtTheOpenCall() {
        var pending = PendingDocuments(paths: ["/a.md"], openedAt: openedAt)
        let alertDismissed = openedAt + .seconds(30)
        #expect(pending.reconcile(openPaths: [], at: alertDismissed).isEmpty)
        let failed = pending.reconcile(
            openPaths: [], at: alertDismissed + PendingDocuments.firstReplyGracePeriod)
        #expect(failed == ["/a.md"])
        #expect(pending.isEmpty)
    }

    // Documents queued behind a modal may still be opening when the app answers again.
    @Test func keepsAPathMissingOnlyFromTheFirstReplyAfterALateStart() {
        var pending = PendingDocuments(paths: ["/a.md"], openedAt: openedAt)
        let alertDismissed = openedAt + .seconds(30)
        _ = pending.reconcile(openPaths: [], at: alertDismissed)
        let failed = pending.reconcile(openPaths: [], at: alertDismissed + .seconds(2))
        #expect(failed.isEmpty)
        _ = pending.reconcile(openPaths: ["/a.md"], at: alertDismissed + .seconds(4))
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
