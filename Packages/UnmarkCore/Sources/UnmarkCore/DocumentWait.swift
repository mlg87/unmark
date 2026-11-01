import Foundation

/// The distributed notifications `unmark --wait` and the app exchange (#37). `DistributedNotificationCenter` may
/// drop notifications under load, so the tool doesn't rely on `documentClosed` alone: it also polls with
/// `queryOpen` and reconciles against the `openPaths` reply. Any process can post these names, so payloads are
/// parsed defensively and only ever let a waiting tool exit early.
public enum DocumentWaitMessage {
    /// App → tool: a document window closed. `userInfo`: `path`, `pid`.
    public static let documentClosed = Notification.Name("com.mlg87.unmark.documentClosed")
    /// Tool → app: asks for `openPaths`. No `userInfo`.
    public static let queryOpen = Notification.Name("com.mlg87.unmark.queryOpen")
    /// App → tool: every path open right now. `userInfo`: `paths`, `pid`.
    public static let openPaths = Notification.Name("com.mlg87.unmark.openPaths")

    public static let pathKey = "path"
    public static let pathsKey = "paths"
    /// The posting app's process ID, so a tool ignores other running copies of Unmark, such as a dev build.
    public static let pidKey = "pid"

    /// The form both sides compare paths in. The app's `fileURL` and the path typed on the command line can name
    /// the same file differently: relative, through a symlink, or with `.` and `..` components.
    public static func canonicalPath(of fileURL: URL) -> String {
        fileURL.standardizedFileURL.resolvingSymlinksInPath().path
    }

    public static func documentClosedUserInfo(path: String, pid: Int32) -> [String: Any] {
        [pathKey: path, pidKey: pid]
    }

    public static func openPathsUserInfo(paths: [String], pid: Int32) -> [String: Any] {
        [pathsKey: paths, pidKey: pid]
    }

    /// The closed path, if `userInfo` is a well-formed `documentClosed` payload from process `pid`.
    public static func closedPath(in userInfo: [AnyHashable: Any]?, from pid: Int32) -> String? {
        guard sender(of: userInfo) == pid else { return nil }
        return userInfo?[pathKey] as? String
    }

    /// The open paths, if `userInfo` is a well-formed `openPaths` payload from process `pid`.
    public static func openPaths(in userInfo: [AnyHashable: Any]?, from pid: Int32) -> Set<String>? {
        guard sender(of: userInfo) == pid, let paths = userInfo?[pathsKey] as? [String] else { return nil }
        return Set(paths)
    }

    /// Distributed notifications carry property-list values, so the `Int32` arrives as an `NSNumber`.
    private static func sender(of userInfo: [AnyHashable: Any]?) -> Int32? {
        (userInfo?[pidKey] as? NSNumber)?.int32Value
    }
}

/// The documents an `unmark --wait` run is still waiting on (#37).
public struct PendingDocuments: Sendable {
    /// How long after the open call a path may go unlisted in `openPaths` replies before the tool reports it as
    /// failed to open. The open request and the first query race, so a path missing from early replies may still be
    /// opening; one missing for this long failed to open, and its window will never close.
    public static let openGracePeriod: Duration = .seconds(10)
    /// How long after the app's first reply a path may go unlisted. While the app shows a modal, such as the alert
    /// for a file it couldn't open, it answers no queries, and documents queued behind the alert may still be opening
    /// when it's dismissed. Two of the tool's 2 s query rounds fit in this, so one late reply alone can't fail a path.
    public static let firstReplyGracePeriod: Duration = .seconds(4)

    public private(set) var paths: Set<String>
    /// Paths some reply has listed. Only these are dropped when a later reply leaves them out.
    private var confirmedOpen: Set<String> = []
    private let openedAt: ContinuousClock.Instant
    private var firstReply: ContinuousClock.Instant?

    /// `openedAt` is when the app accepted the open request.
    public init(paths: some Sequence<String>, openedAt: ContinuousClock.Instant) {
        self.paths = Set(paths)
        self.openedAt = openedAt
    }

    public var isEmpty: Bool { paths.isEmpty }

    public mutating func documentClosed(_ path: String) {
        paths.remove(path)
    }

    /// Applies an `openPaths` reply received at `now`, which recovers `documentClosed` notifications that were
    /// dropped. Returns the paths it stopped waiting on because the app failed to open them.
    public mutating func reconcile(openPaths: Set<String>, at now: ContinuousClock.Instant) -> Set<String> {
        let firstReply = self.firstReply ?? now
        self.firstReply = firstReply
        confirmedOpen.formUnion(paths.intersection(openPaths))
        let neverOpened = paths.subtracting(confirmedOpen)
        let deadline = max(openedAt + Self.openGracePeriod, firstReply + Self.firstReplyGracePeriod)
        guard now >= deadline else {
            paths = paths.intersection(openPaths).union(neverOpened)
            return []
        }
        paths.formIntersection(openPaths)
        return neverOpened
    }
}
