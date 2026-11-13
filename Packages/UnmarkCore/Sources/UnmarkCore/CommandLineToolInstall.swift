import Foundation

/// Installing the `unmark` command-line tool from Settings (#40), for DMG users without Homebrew (q37, q56): a
/// symlink at `/usr/local/bin/unmark` to the tool inside the running copy of Unmark.app.
public enum CommandLineToolInstall {
    public static let linkDirectoryPath = "/usr/local/bin"
    public static let linkPath = "/usr/local/bin/unmark"
    /// Contents/Helpers, not Contents/MacOS: on case-insensitive APFS, `MacOS/unmark` is the app's own `Unmark`.
    public static let bundleRelativeToolPath = "Contents/Helpers/unmark"

    public enum Status: Equatable, Sendable {
        /// The link resolves to this app's tool.
        case installed
        /// Something is at the link path but doesn't resolve to this app's tool, such as a link left behind when
        /// Unmark.app moved.
        case stale
        case notInstalled
    }

    public static func status(ofLinkAt link: URL, toTool tool: URL) -> Status {
        let fileManager = FileManager.default
        // attributesOfItem doesn't follow a final symlink, so a dangling link still counts as something there.
        guard (try? fileManager.attributesOfItem(atPath: link.path)) != nil else { return .notInstalled }
        guard fileManager.fileExists(atPath: tool.path),
            link.resolvingSymlinksInPath().path == tool.resolvingSymlinksInPath().path
        else { return .stale }
        return .installed
    }

    /// Run as root through the admin password prompt.
    public static func installCommand(toolPath: String) -> String {
        "mkdir -p \(linkDirectoryPath) && ln -sf \(shellQuoted(toolPath)) \(linkPath)"
    }

    /// For the user to run in Terminal when the admin prompt is cancelled or fails.
    public static func manualInstallCommand(toolPath: String) -> String {
        "sudo mkdir -p \(linkDirectoryPath) && sudo ln -sf \(shellQuoted(toolPath)) \(linkPath)"
    }

    /// `do shell script … with administrator privileges` shows the standard admin password prompt, so Unmark needs no
    /// privileged helper of its own.
    public static func installAppleScript(toolPath: String) -> String {
        "do shell script \(appleScriptQuoted(installCommand(toolPath: toolPath))) with administrator privileges"
    }

    /// The directories in the `PATH` that `/usr/libexec/path_helper -s` prints, such as
    /// `PATH="/usr/local/bin:/usr/bin"; export PATH;`, or nil when it prints none.
    public static func pathDirectories(fromPathHelperOutput output: String) -> [String]? {
        guard let match = output.firstMatch(of: #/(?m)^PATH="([^"]*)"/#) else { return nil }
        return match.1.split(separator: ":").map(String.init)
    }

    private static func shellQuoted(_ string: String) -> String {
        "'" + string.replacing("'", with: #"'\''"#) + "'"
    }

    private static func appleScriptQuoted(_ string: String) -> String {
        "\"" + string.replacing("\\", with: #"\\"#).replacing("\"", with: #"\""#) + "\""
    }
}
