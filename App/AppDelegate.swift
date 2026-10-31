import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = MainMenu.make()
        // Before AppKit opens the launch's documents, so the Preview's web view loads while they're read (q47).
        PreviewWebViewPool.shared.prepare()
        // Before the launch's documents open, so `unmark --wait` gets answers about them from the start (#37).
        OpenDocumentsBroadcaster.shared.start()
    }

    /// Unmark opens existing files only (q21): an empty launch shows the Open panel instead of an Untitled
    /// document, and Cancel leaves the app running with no windows.
    func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool {
        // AppKit asks mid-launch; the ADR-0003 spike showed the panel reliably once launch finished.
        DispatchQueue.main.async {
            NSDocumentController.shared.openDocument(nil)
        }
        return false
    }

    /// A Dock click with no documents open behaves like an empty launch (q21). With only minimized windows,
    /// returning `true` keeps AppKit's default of restoring one.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        guard !flag, NSDocumentController.shared.documents.isEmpty else { return true }
        NSDocumentController.shared.openDocument(nil)
        return false
    }
}
