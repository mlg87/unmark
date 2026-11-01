// Asks a running Unmark which documents it has open, the way `unmark --wait` does, so CI can check that
// `unmark a.md b.md` left both documents open after the tool exited (unmark-1793451428486-7-de60d292.1).
//
// usage: swift scripts/ci/open-documents.swift <pid> <path>...
//
// Prints the app's open paths, one per line, and exits 0 once they include every <path>. Exits 1 if they don't
// within `timeout`, which also covers an app that never answers.
import AppKit

// A script can't import UnmarkCore, so these mirror `DocumentWaitMessage` in
// Packages/UnmarkCore/Sources/UnmarkCore/DocumentWait.swift.
let queryOpen = Notification.Name("com.mlg87.unmark.queryOpen")
let openPaths = Notification.Name("com.mlg87.unmark.openPaths")

/// Matches `DocumentWaitMessage.canonicalPath(of:)`, the form the app reports paths in.
func canonicalPath(_ path: String) -> String {
    URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath().path
}

/// Long enough for a cold launch on a CI runner to finish opening its documents.
let timeout: TimeInterval = 30
/// The app may still be opening documents, or the system may drop a notification, so the query repeats.
let queryInterval: TimeInterval = 0.5

let arguments = CommandLine.arguments.dropFirst()
guard let pid = arguments.first.flatMap(Int32.init), arguments.count > 1 else {
    FileHandle.standardError.write(Data("usage: open-documents.swift <pid> <path>...\n".utf8))
    exit(2)
}
let expected = Set(arguments.dropFirst().map(canonicalPath))

let center = DistributedNotificationCenter.default()
nonisolated(unsafe) var reply: [String]?
_ = center.addObserver(forName: openPaths, object: nil, queue: .main) { notification in
    // Distributed notifications carry property-list values, so the pid arrives as an NSNumber.
    guard let userInfo = notification.userInfo, (userInfo["pid"] as? NSNumber)?.int32Value == pid,
        let paths = userInfo["paths"] as? [String]
    else { return }
    reply = paths
}

let deadline = Date(timeIntervalSinceNow: timeout)
while Date() < deadline {
    center.postNotificationName(queryOpen, object: nil, userInfo: nil, deliverImmediately: true)
    RunLoop.main.run(until: Date(timeIntervalSinceNow: queryInterval))
    if let reply, expected.isSubset(of: reply) {
        print(reply.sorted().joined(separator: "\n"))
        exit(0)
    }
}

let missing = expected.subtracting(reply ?? []).sorted()
FileHandle.standardError.write(
    Data("open-documents: process \(pid) never reported open: \(missing.joined(separator: ", "))\n".utf8))
if let reply {
    FileHandle.standardError.write(Data("open-documents: last reply: \(reply.sorted())\n".utf8))
}
exit(1)
