import AppKit
import UnmarkCore

/// Tells `unmark --wait` which documents are open, so `GIT_EDITOR="unmark --wait"` returns when the user closes the
/// message's window rather than when Unmark quits, which is all `open -W` can wait for (#37).
@MainActor
final class OpenDocumentsBroadcaster {
    static let shared = OpenDocumentsBroadcaster()

    private let center = DistributedNotificationCenter.default()
    private let pid = ProcessInfo.processInfo.processIdentifier
    private var queryObserver: NSObjectProtocol?

    /// Starts answering `queryOpen`. Call once at launch.
    func start() {
        guard queryObserver == nil else { return }
        let query = DocumentWaitMessage.queryOpen
        queryObserver = center.addObserver(forName: query, object: nil, queue: .main) { _ in
            // `queue: .main` runs this on the main thread.
            MainActor.assumeIsolated { OpenDocumentsBroadcaster.shared.postOpenPaths() }
        }
    }

    func documentClosed(at fileURL: URL) {
        post(
            DocumentWaitMessage.documentClosed,
            userInfo: DocumentWaitMessage.documentClosedUserInfo(
                path: DocumentWaitMessage.canonicalPath(of: fileURL), pid: pid))
    }

    private func postOpenPaths() {
        let paths = NSDocumentController.shared.documents.compactMap(\.fileURL).map(DocumentWaitMessage.canonicalPath)
        post(DocumentWaitMessage.openPaths, userInfo: DocumentWaitMessage.openPathsUserInfo(paths: paths, pid: pid))
    }

    private func post(_ name: Notification.Name, userInfo: [String: Any]) {
        // The tool isn't an NSApplication, but delivering immediately keeps the reply prompt whatever its state.
        center.postNotificationName(name, object: nil, userInfo: userInfo, deliverImmediately: true)
    }
}
