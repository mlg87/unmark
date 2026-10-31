import Foundation

/// Watches a document's file for changes other apps make and decides when the document should reload (ADR-0003,
/// External-change mechanism, #24). Two sources feed it: a kqueue vnode source on the file, which fires within
/// milliseconds, and the document's `NSFilePresenter` callbacks, which take about 1 s for the uncoordinated writes
/// most editors and `git` make but are the only source that reports where a moved file went.
@MainActor
final class ExternalChangeMonitor {
    /// Coalesces bursts, such as editors that write twice per save, into one reload. #24 asks for 10 saves in 1 s to
    /// cost at most 2 renders. Evenly spaced, those saves are about 111 ms apart, which a 100 ms debounce let through
    /// as 10 renders. 150 ms coalesces them and keeps a single save well inside the 500 ms reload target.
    private static let debounce = Duration.milliseconds(150)
    /// How long a file that left its path gets to come back before it counts as moved or deleted. Some tools save by
    /// deleting the file and then creating it again, which leaves the path briefly empty.
    private static let reappearTimeout = Duration.milliseconds(200)
    private static let reappearPollInterval = Duration.milliseconds(20)

    /// Called once per burst of changes. The receiver compares modification dates, so a call can be a duplicate.
    private let fileDidChange: @MainActor () -> Void
    /// Called when the file was deleted rather than replaced or moved.
    private let fileWasDeleted: @MainActor () -> Void
    /// Called when a file is at the path again after `fileWasDeleted`. `fileDidChange` follows to reload it.
    private let fileDidReappear: @MainActor () -> Void

    private var watchedURL: URL?
    private var watcher: VnodeWatcher?
    /// Runs only while the file is deleted, to see it come back (#73).
    private var folderWatcher: VnodeWatcher?
    private var isDeleted = false
    private var pendingChange: Task<Void, Never>?
    private var pendingLookup: Task<Void, Never>?

    init(
        fileDidChange: @escaping @MainActor () -> Void, fileWasDeleted: @escaping @MainActor () -> Void,
        fileDidReappear: @escaping @MainActor () -> Void
    ) {
        self.fileDidChange = fileDidChange
        self.fileWasDeleted = fileWasDeleted
        self.fileDidReappear = fileDidReappear
    }

    /// Watches the file now at `url`, replacing any earlier watch. Also call it with the URL
    /// `presentedItemDidMove(to:)` passes: the document's `fileURL` changes only some time after that callback.
    func watch(_ url: URL) {
        pendingLookup?.cancel()
        pendingLookup = nil
        watchedURL = url
        watcher = VnodeWatcher(url: url, eventMask: [.write, .extend, .rename, .delete]) { [weak self] event in
            self?.handle(event)
        }
        // With nothing at `url` yet, a deleted file keeps its folder watch.
        if isDeleted, watcher != nil {
            isDeleted = false
            folderWatcher = nil
            fileDidReappear()
        }
    }

    /// For `presentedItemDidChange()`. Usually a late duplicate of a change the vnode source already reported. With
    /// no vnode source running, it also tries to re-arm one, in case the file is back and the folder watch missed it.
    /// A running source is kept, since `url` may still be the pre-move `fileURL`.
    func presenterReportedChange(at url: URL) {
        if watcher == nil {
            watch(url)
        }
        scheduleChange()
    }

    func stop() {
        pendingChange?.cancel()
        pendingLookup?.cancel()
        pendingChange = nil
        pendingLookup = nil
        watcher = nil
        folderWatcher = nil
        isDeleted = false
        watchedURL = nil
    }

    private func handle(_ event: DispatchSource.FileSystemEvent) {
        guard !event.isDisjoint(with: [.rename, .delete]) else {
            scheduleChange()
            return
        }
        // The watched file left the path, and the source follows that file, not the path. A file at the path again
        // means an atomic save replaced it. Otherwise it was moved, and presentedItemDidMove(to:) calls watch(_:)
        // with the new URL, or deleted, which NSDocument has no callback for.
        watcher = nil
        guard let url = watchedURL else { return }
        pendingLookup?.cancel()
        pendingLookup = Task { [weak self] in
            let deadline = ContinuousClock.now + Self.reappearTimeout
            while !Self.fileExists(at: url), ContinuousClock.now < deadline {
                try? await Task.sleep(for: Self.reappearPollInterval)
            }
            guard !Task.isCancelled, let self else { return }
            pendingLookup = nil
            if Self.fileExists(at: url) {
                watch(url)
                scheduleChange()
            } else if event.contains(.delete) {
                isDeleted = true
                fileWasDeleted()
                watchFolder(for: url)
            }
        }
    }

    /// A deleted file can come back at its path long after the reappear timeout, for example through
    /// `git checkout -- file` or a restore from backup (#73). Creating a file writes its folder, so a vnode source on
    /// the folder reports it.
    private func watchFolder(for url: URL) {
        folderWatcher = VnodeWatcher(url: url.deletingLastPathComponent(), eventMask: .write) { [weak self] _ in
            self?.rearmIfFileExists(at: url)
        }
        // The file may have come back before the folder's source started.
        rearmIfFileExists(at: url)
    }

    private func rearmIfFileExists(at url: URL) {
        watch(url)
        if watcher != nil {
            scheduleChange()
        }
    }

    private func scheduleChange() {
        pendingChange?.cancel()
        pendingChange = Task { [weak self] in
            try? await Task.sleep(for: Self.debounce)
            guard !Task.isCancelled, let self else { return }
            pendingChange = nil
            fileDidChange()
        }
    }

    nonisolated private static func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
    }
}

/// A `DispatchSource` vnode source on one file or folder. On a file, it follows the file it opened across renames and
/// stops seeing the path once another file replaces it there.
@MainActor
private final class VnodeWatcher {
    private let source: any DispatchSourceFileSystemObject

    /// `nil` when nothing at `url` can be opened.
    init?(
        url: URL, eventMask: DispatchSource.FileSystemEvent,
        onEvent: @escaping @MainActor (DispatchSource.FileSystemEvent) -> Void
    ) {
        // O_EVTONLY watches without keeping the volume from unmounting.
        let descriptor = open(url.path(percentEncoded: false), O_EVTONLY)
        guard descriptor >= 0 else { return nil }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: descriptor, eventMask: eventMask, queue: .main)
        // The handler holds the source until cancel() releases the handlers.
        source.setEventHandler {
            MainActor.assumeIsolated { onEvent(source.data) }
        }
        source.setCancelHandler { close(descriptor) }
        source.activate()
        self.source = source
    }

    deinit {
        source.cancel()
    }
}
