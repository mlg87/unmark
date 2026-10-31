import AppKit
import UnmarkCore

/// Waits until Unmark has closed every document `unmark --wait` opened, or has quit (#37). It needs the main run
/// loop running, which awaiting from the tool's top-level code provides.
@MainActor
final class DocumentWaiter {
    /// How often to ask the app what's open, which recovers `documentClosed` notifications the system dropped.
    /// It also bounds how long a quit can go unnoticed if the termination notification is missed.
    private static let queryInterval: TimeInterval = 2

    private let app: NSRunningApplication
    private var pending: PendingDocuments
    private var continuation: CheckedContinuation<Void, Never>?
    private var observers: [(NotificationCenter, NSObjectProtocol)] = []
    private var queryTimer: Timer?

    init(app: NSRunningApplication, fileURLs: [URL]) {
        self.app = app
        pending = PendingDocuments(paths: fileURLs.map(DocumentWaitMessage.canonicalPath))
    }

    /// Returns once every document's window has closed, saved or not (q44).
    func wait() async {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            start()
        }
    }

    private func start() {
        let pid = app.processIdentifier
        let distributed = DistributedNotificationCenter.default()
        observe(DocumentWaitMessage.documentClosed, on: distributed) {
            DocumentWaitMessage.closedPath(in: $0, from: pid)
        } handle: { waiter, path in
            waiter.pending.documentClosed(path)
            waiter.finishIfDone()
        }
        observe(DocumentWaitMessage.openPaths, on: distributed) {
            DocumentWaitMessage.openPaths(in: $0, from: pid)
        } handle: { waiter, openPaths in
            waiter.pending.reconcile(openPaths: openPaths, at: .now)
            waiter.finishIfDone()
        }
        observe(NSWorkspace.didTerminateApplicationNotification, on: NSWorkspace.shared.notificationCenter) {
            ($0?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.processIdentifier == pid ? () : nil
        } handle: { waiter, _ in
            waiter.finish()
        }
        queryTimer = Timer.scheduledTimer(withTimeInterval: Self.queryInterval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.query() }
        }
        query()
    }

    /// `parse` runs before the hop to the main actor, so only its `Sendable` result crosses, not the `userInfo`.
    private func observe<Payload: Sendable>(
        _ name: Notification.Name, on center: NotificationCenter,
        parse: @escaping @Sendable ([AnyHashable: Any]?) -> Payload?,
        handle: @escaping @MainActor (DocumentWaiter, Payload) -> Void
    ) {
        let observer = center.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
            guard let payload = parse(notification.userInfo) else { return }
            // `queue: .main` runs this on the main thread.
            MainActor.assumeIsolated {
                guard let self else { return }
                handle(self, payload)
            }
        }
        observers.append((center, observer))
    }

    private func query() {
        // A quit app answers nothing, so its documents count as closed.
        guard !app.isTerminated else { return finish() }
        DistributedNotificationCenter.default().postNotificationName(
            DocumentWaitMessage.queryOpen, object: nil, userInfo: nil, deliverImmediately: true)
    }

    private func finishIfDone() {
        if pending.isEmpty {
            finish()
        }
    }

    private func finish() {
        queryTimer?.invalidate()
        for (center, observer) in observers {
            center.removeObserver(observer)
        }
        observers.removeAll()
        continuation?.resume()
        continuation = nil
    }
}
