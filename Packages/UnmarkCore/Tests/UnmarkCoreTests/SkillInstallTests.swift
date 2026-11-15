import Foundation
import Testing
import UnmarkCore

struct SkillInstallTests {
    /// A scratch folder holding an empty `home/` and `Unmark.app/Contents/Resources/skills/` with two skills.
    private struct Scratch {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        var home: URL { directory.appending(path: "home") }
        var app: URL { directory.appending(path: "Unmark.app") }
        var skillsDirectory: URL { app.appending(path: SkillInstall.bundleRelativeSkillsPath) }
        var skills: [URL] { SkillInstall.bundledSkills(in: skillsDirectory) }
        var targets: [SkillInstall.Target] { SkillInstall.targets(home: home) }
        var agentsSkills: URL { home.appending(path: ".agents/skills") }

        init() throws {
            try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
            for name in ["unmark-docs", "unmark-polish"] {
                let skill = skillsDirectory.appending(path: name)
                try FileManager.default.createDirectory(at: skill, withIntermediateDirectories: true)
                try Data("# \(name)\n".utf8).write(to: skill.appending(path: "SKILL.md"))
            }
        }

        func createClaudeFolder() throws {
            try FileManager.default.createDirectory(
                at: home.appending(path: ".claude"), withIntermediateDirectories: true)
        }

        func remove() { try? FileManager.default.removeItem(at: directory) }
    }

    @Test func targetsAgentsOnlyWithoutAClaudeFolder() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        #expect(scratch.targets.map(\.skillsDirectory) == [scratch.agentsSkills])
    }

    @Test func targetsClaudeTooWhenItsFolderExists() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        try scratch.createClaudeFolder()
        #expect(
            scratch.targets.map(\.skillsDirectory) == [
                scratch.agentsSkills, scratch.home.appending(path: ".claude/skills"),
            ])
    }

    @Test func bundledSkillsLeaveOutAFolderWithoutSkillFile() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        try FileManager.default.createDirectory(
            at: scratch.skillsDirectory.appending(path: "unmark-draft"), withIntermediateDirectories: true)
        #expect(scratch.skills.map(\.lastPathComponent) == ["unmark-docs", "unmark-polish"])
    }

    @Test func installIntoAnEmptyHomeLinksEverySkill() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        try scratch.createClaudeFolder()
        let outcome = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        let expected = scratch.targets.flatMap { target in
            scratch.skills.map { target.skillsDirectory.appending(path: $0.lastPathComponent) }
        }
        #expect(outcome == SkillInstall.InstallOutcome(linked: expected, conflicts: []))
        let link = scratch.agentsSkills.appending(path: "unmark-docs")
        #expect(
            try FileManager.default.destinationOfSymbolicLink(atPath: link.path)
                == scratch.skillsDirectory.appending(path: "unmark-docs").path)
        #expect(SkillInstall.status(skills: scratch.skills, targets: scratch.targets) == .installed)
    }

    @Test func secondInstallChangesNothing() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        let first = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        let link = scratch.agentsSkills.appending(path: "unmark-docs")
        let createdBefore = try FileManager.default.attributesOfItem(atPath: link.path)[.creationDate] as? Date
        let second = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        #expect(second == first)
        #expect(try FileManager.default.attributesOfItem(atPath: link.path)[.creationDate] as? Date == createdBefore)
        #expect(SkillInstall.status(skills: scratch.skills, targets: scratch.targets) == .installed)
    }

    // Acceptance for #236: after Unmark.app moves, the links dangle, and installing from the moved app repairs them.
    @Test func linksGoStaleWhenTheAppMovesAndInstallReplacesThem() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        _ = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        let movedApp = scratch.directory.appending(path: "Moved.app")
        try FileManager.default.moveItem(at: scratch.app, to: movedApp)
        let movedSkills = SkillInstall.bundledSkills(
            in: movedApp.appending(path: SkillInstall.bundleRelativeSkillsPath))
        let target = try #require(scratch.targets.first)
        #expect(SkillInstall.linkState(of: movedSkills[0], in: target) == .stale)
        #expect(SkillInstall.status(skills: movedSkills, targets: scratch.targets) == .partlyInstalled)

        let outcome = try SkillInstall.install(skills: movedSkills, into: scratch.targets)
        #expect(outcome.conflicts.isEmpty)
        #expect(outcome.linked.count == movedSkills.count)
        #expect(SkillInstall.linkState(of: movedSkills[0], in: target) == .linked)
        #expect(SkillInstall.status(skills: movedSkills, targets: scratch.targets) == .installed)
    }

    @Test func realFolderWithTheNameIsAConflict() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        let folder = scratch.agentsSkills.appending(path: "unmark-docs")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let outcome = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        #expect(outcome.conflicts == [folder])
        #expect(outcome.linked == [scratch.agentsSkills.appending(path: "unmark-polish")])
        #expect((try? FileManager.default.destinationOfSymbolicLink(atPath: folder.path)) == nil)
        #expect(SkillInstall.linkState(of: scratch.skills[0], in: scratch.targets[0]) == .conflict)
    }

    @Test func someoneElsesLinkWithTheNameIsAConflict() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        let elsewhere = scratch.directory.appending(path: "my-skills/unmark-docs")
        try FileManager.default.createDirectory(at: elsewhere, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: scratch.agentsSkills, withIntermediateDirectories: true)
        let link = scratch.agentsSkills.appending(path: "unmark-docs")
        try FileManager.default.createSymbolicLink(atPath: link.path, withDestinationPath: elsewhere.path)
        let outcome = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        #expect(outcome.conflicts == [link])
        #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == elsewhere.path)
    }

    @Test func uninstallRemovesOnlyUnmarksLinks() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: scratch.agentsSkills, withIntermediateDirectories: true)
        // A conflict, a folder of another tool's skill, and a stale link from an app since deleted.
        let conflict = scratch.agentsSkills.appending(path: "unmark-docs")
        try fileManager.createDirectory(at: conflict, withIntermediateDirectories: true)
        let beads = scratch.agentsSkills.appending(path: "beads")
        try fileManager.createDirectory(at: beads, withIntermediateDirectories: true)
        let stale = scratch.agentsSkills.appending(path: "unmark-retired")
        try fileManager.createSymbolicLink(
            atPath: stale.path,
            withDestinationPath: "/Applications/Gone.app/\(SkillInstall.bundleRelativeSkillsPath)/unmark-retired")
        _ = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        let current = scratch.agentsSkills.appending(path: "unmark-polish")

        let removed = try SkillInstall.uninstall(from: scratch.targets)
        #expect(Set(removed) == [current, stale])
        #expect(
            try fileManager.contentsOfDirectory(atPath: scratch.agentsSkills.path).sorted() == ["beads", "unmark-docs"])
        #expect(SkillInstall.status(skills: scratch.skills, targets: scratch.targets) == .notInstalled)
    }

    @Test func claudeFolderCreatedAfterInstallMakesItPartlyInstalled() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        _ = try SkillInstall.install(skills: scratch.skills, into: scratch.targets)
        try scratch.createClaudeFolder()
        #expect(SkillInstall.status(skills: scratch.skills, targets: scratch.targets) == .partlyInstalled)
    }

    @Test func noSkillsIsNotInstalled() throws {
        let scratch = try Scratch()
        defer { scratch.remove() }
        #expect(SkillInstall.status(skills: [], targets: scratch.targets) == .notInstalled)
    }
}
