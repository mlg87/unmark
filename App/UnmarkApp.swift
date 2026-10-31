import AppKit

/// AppKit lifecycle rather than a SwiftUI `App`: SwiftUI's `DocumentGroup` can't show the Open panel on an
/// empty launch or turn off autosave (ADR-0003).
@main
@MainActor
enum UnmarkApp {
    static func main() {
        let app = NSApplication.shared
        // The first NSDocumentController created becomes `shared`, so this must run before anything touches it.
        _ = DocumentController()
        let delegate = AppDelegate()
        // NSApplication holds its delegate weakly.
        withExtendedLifetime(delegate) {
            app.delegate = delegate
            app.run()
        }
    }
}
