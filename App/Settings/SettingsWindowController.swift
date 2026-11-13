import AppKit
import SwiftUI

/// The one Settings window. An `NSWindow` hosts the SwiftUI form because the AppKit lifecycle has no SwiftUI
/// `Settings` scene (ADR-0003). The window outlives being closed, so Settings… reopens the same one.
@MainActor
final class SettingsWindowController: NSWindowController {
    static let shared = SettingsWindowController()

    private init() {
        let hostingController = NSHostingController(rootView: GeneralSettingsView())
        // The window takes its size from the form, which sets its own width.
        hostingController.sizingOptions = .preferredContentSize
        let window = NSWindow(contentViewController: hostingController)
        window.title = String(localized: "Settings")
        window.styleMask = [.titled, .closable]
        // This controller keeps the window for reopening; AppKit releasing it on close would leave a dangling one.
        window.isReleasedWhenClosed = false
        window.center()
        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("SettingsWindowController is created in code")
    }
}
