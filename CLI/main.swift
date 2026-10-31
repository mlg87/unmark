import AppKit
import UnmarkCore

/// Exit statuses follow the BSD convention `open`, `cat`, and friends use.
enum ExitStatus: Int32 {
    case success = 0
    case failure = 1
    case usage = 2
}

func printError(_ message: String) {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
}

func exit(_ status: ExitStatus) -> Never {
    exit(status.rawValue)
}

/// The tool's own path with symlinks resolved, so `/usr/local/bin/unmark -> …/Unmark.app/Contents/Helpers/unmark`
/// finds that app. `CommandLine.arguments[0]` is only the name the shell ran, which may be relative or PATH-found.
func resolvedExecutableURL() -> URL {
    var size: UInt32 = 0
    _NSGetExecutablePath(nil, &size)
    var buffer = [CChar](repeating: 0, count: Int(size))
    _NSGetExecutablePath(&buffer, &size)
    let path = buffer.withUnsafeBufferPointer { String(cString: $0.baseAddress!) }
    return URL(fileURLWithPath: path).resolvingSymlinksInPath()
}

func containingApp() -> URL {
    let executableURL = resolvedExecutableURL()
    guard let appURL = CLICommand.containingAppBundle(of: executableURL) else {
        printError("unmark: \(executableURL.path) is not inside Unmark.app")
        exit(.failure)
    }
    return appURL
}

let command: CLICommand
do throws(CLICommand.UsageError) {
    command = try CLICommand.parse(Array(CommandLine.arguments.dropFirst()))
} catch {
    if case .unknownOption(let option) = error {
        printError("unmark: unrecognized option '\(option)'")
    }
    printError(CLICommand.usage)
    exit(.usage)
}

switch command {
case .help:
    print(CLICommand.usage)
    exit(.success)

case .version:
    let version = Bundle(url: containingApp())?.object(forInfoDictionaryKey: "CFBundleShortVersionString")
    print("unmark \(version as? String ?? "unknown")")
    exit(.success)

case .open(let paths, let wait):
    var fileURLs: [URL] = []
    var anyMissing = false
    for path in paths {
        // Relative paths resolve against the shell's working directory. Following symlinks opens the real file,
        // which is what the app watches for external changes.
        let fileURL = URL(fileURLWithPath: path).resolvingSymlinksInPath()
        if FileManager.default.fileExists(atPath: fileURL.path) {
            fileURLs.append(fileURL)
        } else {
            // Unmark never creates files (q17), so a missing path is reported, not opened.
            printError("unmark: \(path): No such file or directory")
            anyMissing = true
        }
    }

    if !fileURLs.isEmpty {
        let app: NSRunningApplication
        do {
            // One call, so the app receives a single open event and can group the files as tabs.
            app = try await NSWorkspace.shared.open(
                fileURLs, withApplicationAt: containingApp(), configuration: NSWorkspace.OpenConfiguration())
        } catch {
            printError("unmark: \(error.localizedDescription)")
            exit(.failure)
        }
        if wait {
            await DocumentWaiter(app: app, fileURLs: fileURLs).wait()
        }
    }
    exit(anyMissing ? .failure : .success)
}
