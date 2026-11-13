import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Settings' Defaults section (#39). Finder double-click is how most markdown files get opened (q6), so one button here
/// replaces Get Info → Change All.
struct DefaultMarkdownAppSection: View {
    private enum Status: Equatable {
        case notDefault
        case settingDefault
        case isDefault
        case failed(message: String)
    }

    /// Info.plist's imported declaration: macOS 14 has no `UTType.markdown`.
    private static let markdownType = UTType(importedAs: "net.daringfireball.markdown")

    @State private var status = Status.notDefault

    var body: some View {
        Section("Defaults") {
            if status == .isDefault {
                Text("✓ Unmark opens markdown files")
                    .foregroundStyle(.secondary)
            } else {
                Button("Make Unmark the Default Markdown App") {
                    Task { await makeUnmarkTheDefault() }
                }
                .disabled(status == .settingDefault)
                if case .failed(let message) = status {
                    Text(verbatim: message)
                        .foregroundStyle(.red)
                }
            }
        }
        .onAppear {
            status = Self.unmarkIsTheDefault() ? .isDefault : .notDefault
        }
    }

    private static func unmarkIsTheDefault() -> Bool {
        guard let appURL = NSWorkspace.shared.urlForApplication(toOpen: markdownType) else { return false }
        // LaunchServices keeps the default by bundle ID, so it may name another copy of Unmark, such as a build next to
        // the one in /Applications. That copy is still Unmark.
        return Bundle(url: appURL)?.bundleIdentifier == Bundle.main.bundleIdentifier
    }

    /// macOS may ask the user to confirm; declining throws, which leaves the button up beside the error.
    private func makeUnmarkTheDefault() async {
        status = .settingDefault
        do {
            try await NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpen: Self.markdownType)
            status = .isDefault
        } catch {
            status = .failed(message: error.localizedDescription)
        }
    }
}
