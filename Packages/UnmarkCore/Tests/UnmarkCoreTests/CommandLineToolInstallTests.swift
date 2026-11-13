import Foundation
import Testing
import UnmarkCore

struct CommandLineToolInstallTests {
    /// A scratch folder holding `Unmark.app/Contents/Helpers/unmark` and an empty `bin/`.
    private struct Scratch {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        var app: URL { directory.appending(path: "Unmark.app") }
        var tool: URL { app.appending(path: CommandLineToolInstall.bundleRelativeToolPath) }
        var link: URL { directory.appending(path: "bin/unmark") }

        init() throws {
            try FileManager.default.createDirectory(
                at: tool.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.createDirectory(
                at: link.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data().write(to: tool)
        }

        func remove() { try? FileManager.default.removeItem(at: directory) }
    }

    @Test func notInstalledWithoutALink() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        #expect(CommandLineToolInstall.status(ofLinkAt: scratch.link, toTool: scratch.tool) == .notInstalled)
    }

    @Test func installedWhenTheLinkResolvesToTheTool() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        try FileManager.default.createSymbolicLink(atPath: scratch.link.path, withDestinationPath: scratch.tool.path)
        #expect(CommandLineToolInstall.status(ofLinkAt: scratch.link, toTool: scratch.tool) == .installed)
    }

    // Acceptance for #40: after Unmark.app moves, the old link dangles and Settings offers Reinstall.
    @Test func staleOnceTheAppMoves() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        try FileManager.default.createSymbolicLink(atPath: scratch.link.path, withDestinationPath: scratch.tool.path)
        let movedApp = scratch.directory.appending(path: "Moved.app")
        try FileManager.default.moveItem(at: scratch.app, to: movedApp)
        let movedTool = movedApp.appending(path: CommandLineToolInstall.bundleRelativeToolPath)
        #expect(CommandLineToolInstall.status(ofLinkAt: scratch.link, toTool: movedTool) == .stale)
    }

    @Test func staleWhenAnotherFileHasTheName() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        try Data().write(to: scratch.link)
        #expect(CommandLineToolInstall.status(ofLinkAt: scratch.link, toTool: scratch.tool) == .stale)
    }

    @Test func manualCommandMatchesTheInstalledOneUnderSudo() {
        let toolPath = "/Applications/Unmark.app/Contents/Helpers/unmark"
        #expect(
            CommandLineToolInstall.installCommand(toolPath: toolPath)
                == "mkdir -p /usr/local/bin && ln -sf '\(toolPath)' /usr/local/bin/unmark")
        #expect(
            CommandLineToolInstall.manualInstallCommand(toolPath: toolPath)
                == "sudo mkdir -p /usr/local/bin && sudo ln -sf '\(toolPath)' /usr/local/bin/unmark")
    }

    @Test func quotesAnApostropheInTheToolPath() {
        #expect(
            CommandLineToolInstall.installCommand(toolPath: "/Users/o'neil/Unmark.app")
                == #"mkdir -p /usr/local/bin && ln -sf '/Users/o'\''neil/Unmark.app' /usr/local/bin/unmark"#)
    }

    @Test func escapesTheShellCommandForAppleScript() {
        #expect(
            CommandLineToolInstall.installAppleScript(toolPath: #"/A "B"\C"#)
                == #"do shell script "mkdir -p /usr/local/bin && ln -sf '/A \"B\"\\C' /usr/local/bin/unmark" "#
                + "with administrator privileges")
    }

    @Test func readsThePathFromPathHelper() {
        let output = """
            PATH="/usr/local/bin:/usr/bin:/bin"; export PATH;
            MANPATH="/usr/share/man:/usr/local/share/man"; export MANPATH;
            """
        #expect(
            CommandLineToolInstall.pathDirectories(fromPathHelperOutput: output) == [
                "/usr/local/bin", "/usr/bin", "/bin",
            ])
    }

    @Test func readsNoPathFromUnexpectedOutput() {
        #expect(CommandLineToolInstall.pathDirectories(fromPathHelperOutput: #"setenv PATH "/usr/bin";"#) == nil)
    }
}
