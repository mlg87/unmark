import Foundation
import Testing
import UnmarkCore

struct CLICommandTests {
    @Test func opensPathsInOrder() throws {
        #expect(
            try CLICommand.parse(["README.md", "docs/a.md"]) == .open(paths: ["README.md", "docs/a.md"], wait: false))
    }

    @Test(arguments: [["--wait", "a.md"], ["a.md", "--wait"]])
    func acceptsWaitAnywhere(arguments: [String]) throws {
        #expect(try CLICommand.parse(arguments) == .open(paths: ["a.md"], wait: true))
    }

    @Test(arguments: [[], ["--wait"], ["--"]])
    func rejectsMissingPaths(arguments: [String]) {
        #expect(throws: CLICommand.UsageError.noPaths) { try CLICommand.parse(arguments) }
    }

    @Test(arguments: ["-x", "--split", "-wait", "--help=1"])
    func rejectsUnknownOptions(option: String) {
        #expect(throws: CLICommand.UsageError.unknownOption(option)) { try CLICommand.parse(["a.md", option]) }
    }

    @Test(arguments: [["-h"], ["--help"], ["a.md", "--help"], ["--help", "--bogus"]])
    func helpWinsOverPathsAndLaterOptions(arguments: [String]) throws {
        #expect(try CLICommand.parse(arguments) == .help)
    }

    @Test func unknownOptionBeforeHelpIsAnError() {
        #expect(throws: CLICommand.UsageError.unknownOption("--bogus")) { try CLICommand.parse(["--bogus", "--help"]) }
    }

    @Test func version() throws {
        #expect(try CLICommand.parse(["--version"]) == .version)
    }

    @Test func doubleDashEndsOptions() throws {
        #expect(try CLICommand.parse(["--", "--help", "-x.md"]) == .open(paths: ["--help", "-x.md"], wait: false))
    }

    @Test func loneDashIsAPath() throws {
        #expect(try CLICommand.parse(["-"]) == .open(paths: ["-"], wait: false))
    }

    // Paths, not URLs: whether a directory URL ends in `/` depends on whether it exists on this machine.
    @Test func findsTheAppContainingTheExecutable() {
        let executable = URL(fileURLWithPath: "/Applications/Unmark.app/Contents/Helpers/unmark")
        #expect(CLICommand.containingAppBundle(of: executable)?.path == "/Applications/Unmark.app")
    }

    @Test func picksTheInnermostApp() {
        let executable = URL(
            fileURLWithPath: "/Applications/Outer.app/Contents/Resources/Unmark.app/Contents/Helpers/unmark")
        #expect(
            CLICommand.containingAppBundle(of: executable)?.path
                == "/Applications/Outer.app/Contents/Resources/Unmark.app")
    }

    @Test func findsNoAppOutsideABundle() {
        #expect(CLICommand.containingAppBundle(of: URL(fileURLWithPath: "/usr/local/bin/unmark")) == nil)
    }
}
