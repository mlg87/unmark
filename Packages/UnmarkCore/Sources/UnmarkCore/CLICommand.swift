import Foundation

/// What the `unmark` command-line tool was asked to do: `unmark [--wait] <path>...`, `--help`/`-h`, or `--version`.
public enum CLICommand: Equatable, Sendable {
    /// Open `paths`, as typed, in Unmark. `wait` is parsed now and implemented by the `--wait` bead.
    case open(paths: [String], wait: Bool)
    case help
    case version

    public enum UsageError: Error, Equatable, Sendable {
        case noPaths
        case unknownOption(String)
    }

    public static let usage = """
        usage: unmark [--wait] <path>...
               unmark --help | --version
        """

    /// Parses the arguments after the executable name. `--help` and `--version` win as soon as they're seen,
    /// and `--` ends option parsing so a file named like `-notes.md` can still be opened.
    public static func parse(_ arguments: [String]) throws(UsageError) -> CLICommand {
        var paths: [String] = []
        var wait = false
        var parsesOptions = true

        for argument in arguments {
            guard parsesOptions, argument.hasPrefix("-"), argument != "-" else {
                paths.append(argument)
                continue
            }
            switch argument {
            case "--":
                parsesOptions = false
            case "-h", "--help":
                return .help
            case "--version":
                return .version
            case "--wait":
                wait = true
            default:
                throw .unknownOption(argument)
            }
        }

        guard !paths.isEmpty else { throw .noPaths }
        return .open(paths: paths, wait: wait)
    }

    /// The `.app` bundle containing `executableURL`, so the tool opens files in the copy of Unmark it shipped
    /// with. Callers resolve symlinks first: the tool is usually run through one, such as `/usr/local/bin/unmark`.
    public static func containingAppBundle(of executableURL: URL) -> URL? {
        var directory = executableURL.standardizedFileURL.deletingLastPathComponent()
        while directory.path != "/" {
            if directory.pathExtension == "app" {
                return directory
            }
            directory.deleteLastPathComponent()
        }
        return nil
    }
}
