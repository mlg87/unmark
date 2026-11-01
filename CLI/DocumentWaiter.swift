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
    /// Each file's canonical path and the path as typed, in command-line order, for error messages.
    private let files: [(path: String, argument: String)]
    private var pending: PendingDocuments
    private var anyFailedToOpen = false
    private var continuation: CheckedContinuation<Void, Never>?
    private var observers: [(NotificationCenter, NSObjectProtocol)] = []
    private var queryTimer: Timer?

    /// `files` pairs each path as typed with the file URL the app was asked to open. Create the waiter right after
    /// the open call returns: its grace period for files the app fails to open starts here.
    init(app: NSRunningApplication, files: [(argument: String, url: URL)]) {
        self.app = app
        self.files = files.map { (DocumentWaitMessage.canonicalPath(of: $0.url), $0.argument) }
        pending = PendingDocuments(paths: self.files.map(\.path), openedAt: .now)
    }

    /// Returns once every document's window has closed, saved or not (q44). Returns `false` if the app failed to
    /// open any of them, after reporting each on standard error as it's found.
    func wait() async -> Bool {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            start()
        }
        return !anyFailedToOpen
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
            let failed = waiter.pending.reconcile(openPaths: openPaths, at: .now)
            waiter.reportFailedToOpen(failed)
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

    private func reportFailedToOpen(_ paths: Set<String>) {
        guard !paths.isEmpty else { return }
        anyFailedToOpen = true
        for file in files where paths.contains(file.path) {
            printError("unmark: \(file.argument): could not be opened")
        }
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
