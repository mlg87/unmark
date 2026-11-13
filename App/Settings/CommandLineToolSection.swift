import AppKit
import SwiftUI
import UnmarkCore

/// Settings' Command-Line Tool section (#40): links `/usr/local/bin/unmark` to the tool inside this copy of Unmark.app
/// for DMG users without Homebrew (q37, q56), behind the standard admin password prompt.
struct CommandLineToolSection: View {
    private static let toolURL = Bundle.main.bundleURL.appending(path: CommandLineToolInstall.bundleRelativeToolPath)
    private static let linkURL = URL(fileURLWithPath: CommandLineToolInstall.linkPath)

    @Environment(\.controlActiveState) private var controlActiveState
    @State private var status = Self.currentStatus()
    /// Nil until path_helper answers, or if it can't, so the PATH note only shows when the PATH is known to lack it.
    @State private var pathIncludesLinkDirectory: Bool?
    @State private var showsManualInstall = false

    var body: some View {
        Section("Command-Line Tool") {
            LabeledContent {
                Button(status == .notInstalled ? "Install Command-Line Tool" : "Reinstall", action: install)
            } label: {
                if status == .installed {
                    Text("Installed at \(CommandLineToolInstall.linkPath)")
                } else {
                    Text("Not installed")
                }
                if pathIncludesLinkDirectory == false {
                    Text("Add \(CommandLineToolInstall.linkDirectoryPath) to your PATH")
                }
            }
        }
        .sheet(isPresented: $showsManualInstall) {
            ManualInstallSheet(command: CommandLineToolInstall.manualInstallCommand(toolPath: Self.toolURL.path))
        }
        // The link can change outside Unmark, e.g. from Terminal after the manual-command sheet.
        .onChange(of: controlActiveState) { _, state in
            if state == .key {
                status = Self.currentStatus()
            }
        }
        .task {
            pathIncludesLinkDirectory = await Self.pathHelperDirectories()?.contains(
                CommandLineToolInstall.linkDirectoryPath)
        }
    }

    private static func currentStatus() -> CommandLineToolInstall.Status {
        CommandLineToolInstall.status(ofLinkAt: linkURL, toTool: toolURL)
    }

    /// Any failure, cancelling the password prompt included, falls back to the command to run in Terminal.
    private func install() {
        var error: NSDictionary?
        // NSAppleScript is main-thread only, so the app waits here while the password prompt is up.
        NSAppleScript(source: CommandLineToolInstall.installAppleScript(toolPath: Self.toolURL.path))?
            .executeAndReturnError(&error)
        status = Self.currentStatus()
        if error != nil || status != .installed {
            showsManualInstall = true
        }
    }

    /// The PATH login shells start with. The app's own PATH comes from launchd, not the shell, so it says nothing.
    private nonisolated static func pathHelperDirectories() async -> [String]? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/libexec/path_helper")
        process.arguments = ["-s"]
        let output = Pipe()
        process.standardOutput = output
        do {
            try process.run()
        } catch {
            return nil
        }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard let text = String(bytes: data, encoding: .utf8) else { return nil }
        return CommandLineToolInstall.pathDirectories(fromPathHelperOutput: text)
    }
}

/// Shown when the admin prompt is cancelled or the install fails.
private struct ManualInstallSheet: View {
    let command: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Run this in Terminal:")
            Text(verbatim: command)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
            HStack {
                Spacer()
                Button("Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(command, forType: .string)
                }
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}
