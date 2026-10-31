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
    /// How long the app may keep answering `queryOpen` without listing a path before the tool stops waiting on it.
    /// The open request and the first query race, so a path missing from early replies may still be opening; one
    /// missing for this long failed to open, and its window will never close.
    public static let openGracePeriod: Duration = .seconds(10)

    public private(set) var paths: Set<String>
    /// Paths some reply has listed. Only these are dropped when a later reply leaves them out.
    private var confirmedOpen: Set<String> = []
    private var firstReply: ContinuousClock.Instant?

    public init(paths: some Sequence<String>) {
        self.paths = Set(paths)
    }

    public var isEmpty: Bool { paths.isEmpty }

    public mutating func documentClosed(_ path: String) {
        paths.remove(path)
    }

    /// Applies an `openPaths` reply received at `now`, which recovers `documentClosed` notifications that were
    /// dropped.
    public mutating func reconcile(openPaths: Set<String>, at now: ContinuousClock.Instant) {
        let firstReply = self.firstReply ?? now
        self.firstReply = firstReply
        confirmedOpen.formUnion(paths.intersection(openPaths))
        let graceExpired = now - firstReply >= Self.openGracePeriod
        paths = paths.filter { path in
            openPaths.contains(path) || (!confirmedOpen.contains(path) && !graceExpired)
        }
    }
}
