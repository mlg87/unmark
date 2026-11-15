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

/// `HOME` first, so a caller (CI, or a user scripting a scratch home) can point the skills somewhere other than the
/// account's home folder.
func homeDirectory() -> URL {
    if let home = ProcessInfo.processInfo.environment["HOME"], !home.isEmpty {
        return URL(fileURLWithPath: home, isDirectory: true)
    }
    return FileManager.default.homeDirectoryForCurrentUser
}

func installSkills() throws -> ExitStatus {
    let skillsDirectory = containingApp().appending(path: SkillInstall.bundleRelativeSkillsPath)
    let skills = SkillInstall.bundledSkills(in: skillsDirectory)
    guard !skills.isEmpty else {
        printError("unmark: no skills in \(skillsDirectory.path)")
        return .failure
    }
    let outcome = try SkillInstall.install(skills: skills, into: SkillInstall.targets(home: homeDirectory()))
    for link in outcome.linked {
        print("linked \(link.path)")
    }
    for conflict in outcome.conflicts {
        printError("unmark: \(conflict.path): another skill has this name")
    }
    return outcome.conflicts.isEmpty ? .success : .failure
}

func uninstallSkills() throws -> ExitStatus {
    for link in try SkillInstall.uninstall(from: SkillInstall.targets(home: homeDirectory())) {
        print("removed \(link.path)")
    }
    return .success
}

func exitReportingErrors(_ run: () throws -> ExitStatus) -> Never {
    do {
        exit(try run())
    } catch {
        printError("unmark: \(error.localizedDescription)")
        exit(.failure)
    }
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

case .installSkills:
    exitReportingErrors(installSkills)

case .uninstallSkills:
    exitReportingErrors(uninstallSkills)

case .open(let paths, let wait):
    var files: [(argument: String, url: URL)] = []
    var anyFailed = false
    for path in paths {
        // Relative paths resolve against the shell's working directory. Following symlinks opens the real file,
        // which is what the app watches for external changes.
        let fileURL = URL(fileURLWithPath: path).resolvingSymlinksInPath()
        if FileManager.default.fileExists(atPath: fileURL.path) {
            files.append((path, fileURL))
        } else {
            // Unmark never creates files (q17), so a missing path is reported, not opened.
            printError("unmark: \(path): No such file or directory")
            anyFailed = true
        }
    }

    if !files.isEmpty {
        let app: NSRunningApplication
        do {
            // One call, so the app receives a single open event and can group the files as tabs.
            app = try await NSWorkspace.shared.open(
                files.map(\.url), withApplicationAt: containingApp(), configuration: NSWorkspace.OpenConfiguration())
        } catch {
            printError("unmark: \(error.localizedDescription)")
            exit(.failure)
        }
        if wait, await !DocumentWaiter(app: app, files: files).wait() {
            anyFailed = true
        }
    }
    exit(anyFailed ? .failure : .success)
}
