import Sparkle
import SwiftUI

/// Settings' Updates section (q37). Sparkle keeps the choice itself, in the `SUEnableAutomaticChecks` default.
struct UpdatesSection: View {
    let updater: SPUUpdater

    @Environment(\.controlActiveState) private var controlActiveState
    @State private var automaticallyChecksForUpdates: Bool

    init(updater: SPUUpdater) {
        self.updater = updater
        _automaticallyChecksForUpdates = State(initialValue: updater.automaticallyChecksForUpdates)
    }

    var body: some View {
        Section("Updates") {
            Toggle("Automatically check for updates", isOn: automaticallyChecks)
        }
        // Sparkle's own prompt on the second launch also sets it, possibly while Settings is open behind it.
        .onChange(of: controlActiveState) { _, state in
            if state == .key {
                automaticallyChecksForUpdates = updater.automaticallyChecksForUpdates
            }
        }
    }

    private var automaticallyChecks: Binding<Bool> {
        Binding(
            get: { automaticallyChecksForUpdates },
            set: {
                updater.automaticallyChecksForUpdates = $0
                automaticallyChecksForUpdates = $0
            })
    }
}
