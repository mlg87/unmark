import Foundation

/// Installing Unmark's documentation skills (#229, #236): a symbolic link in each folder agents read skills from, to
/// the skill's folder inside the running copy of Unmark.app. Settings (#238) and the `unmark` command-line tool (#237)
/// both call this, so they agree on what counts as installed.
public enum SkillInstall {
    public static let bundleRelativeSkillsPath = "Contents/Resources/skills"
    private static let skillFileName = "SKILL.md"
    private static let linkNamePrefix = "unmark-"

    /// A folder agents read a user's skills from.
    public struct Target: Equatable, Sendable {
        public let skillsDirectory: URL

        public init(skillsDirectory: URL) {
            self.skillsDirectory = skillsDirectory
        }
    }

    /// `~/.agents/skills` always. `~/.claude/skills` only when `~/.claude` exists, so installing doesn't create a
    /// Claude Code folder for someone who doesn't use it.
    public static func targets(home: URL) -> [Target] {
        var targets = [Target(skillsDirectory: home.appending(path: ".agents/skills"))]
        if FileManager.default.fileExists(atPath: home.appending(path: ".claude").path) {
            targets.append(Target(skillsDirectory: home.appending(path: ".claude/skills")))
        }
        return targets
    }

    /// The folders in `skillsDirectory` that hold a SKILL.md, sorted by name.
    public static func bundledSkills(in skillsDirectory: URL) -> [URL] {
        let fileManager = FileManager.default
        guard let names = try? fileManager.contentsOfDirectory(atPath: skillsDirectory.path) else { return [] }
        return names.sorted()
            .map { skillsDirectory.appending(path: $0) }
            .filter { fileManager.fileExists(atPath: $0.appending(path: skillFileName).path) }
    }

    public enum LinkState: Equatable, Sendable {
        /// Unmark's link, and it resolves to the skill.
        case linked
        /// Nothing has the skill's name.
        case missing
        /// Unmark's link, but it resolves elsewhere or nowhere: the app moved, or another copy of it installed.
        case stale
        /// Anything else: a folder, a file, or a link that isn't Unmark's. Never touched.
        case conflict
    }

    public static func linkState(of skill: URL, in target: Target) -> LinkState {
        let link = target.skillsDirectory.appending(path: skill.lastPathComponent)
        // attributesOfItem doesn't follow a final symlink, so a dangling link still counts as something there.
        guard (try? FileManager.default.attributesOfItem(atPath: link.path)) != nil else { return .missing }
        guard isUnmarkLink(link) else { return .conflict }
        guard FileManager.default.fileExists(atPath: skill.path),
            link.resolvingSymlinksInPath().path == skill.resolvingSymlinksInPath().path
        else { return .stale }
        return .linked
    }

    public enum Status: Equatable, Sendable { case installed, partlyInstalled, notInstalled }

    /// `installed` when every skill is linked in every target, `notInstalled` when none is linked or stale (or there
    /// are no skills), and `partlyInstalled` otherwise.
    public static func status(skills: [URL], targets: [Target]) -> Status {
        let states = targets.flatMap { target in skills.map { linkState(of: $0, in: target) } }
        if states.isEmpty { return .notInstalled }
        if states.allSatisfy({ $0 == .linked }) { return .installed }
        if !states.contains(where: { $0 == .linked || $0 == .stale }) { return .notInstalled }
        return .partlyInstalled
    }

    public struct InstallOutcome: Equatable, Sendable {
        /// Every link that points at `skills` after the call, including links already in place.
        public let linked: [URL]
        /// Paths left unchanged because something that isn't Unmark's link has the name.
        public let conflicts: [URL]
    }

    /// Creates each target folder when it's missing, links missing skills, replaces stale links, and reports conflicts
    /// without touching them.
    public static func install(skills: [URL], into targets: [Target]) throws -> InstallOutcome {
        let fileManager = FileManager.default
        var linked: [URL] = []
        var conflicts: [URL] = []
        for target in targets {
            try fileManager.createDirectory(at: target.skillsDirectory, withIntermediateDirectories: true)
            for skill in skills {
                let link = target.skillsDirectory.appending(path: skill.lastPathComponent)
                switch linkState(of: skill, in: target) {
                case .linked:
                    linked.append(link)
                case .missing:
                    try fileManager.createSymbolicLink(atPath: link.path, withDestinationPath: skill.path)
                    linked.append(link)
                case .stale:
                    // removeItem on a symbolic link removes the link, never what it points at.
                    try fileManager.removeItem(at: link)
                    try fileManager.createSymbolicLink(atPath: link.path, withDestinationPath: skill.path)
                    linked.append(link)
                case .conflict:
                    conflicts.append(link)
                }
            }
        }
        return InstallOutcome(linked: linked, conflicts: conflicts)
    }

    /// Removes Unmark's links, current or stale, and returns their paths. Leaves everything else. Scans each target
    /// rather than taking the bundled skills, so it also removes links to skills a later version dropped.
    public static func uninstall(from targets: [Target]) throws -> [URL] {
        let fileManager = FileManager.default
        var removed: [URL] = []
        for target in targets {
            guard let names = try? fileManager.contentsOfDirectory(atPath: target.skillsDirectory.path) else {
                continue
            }
            for name in names.sorted() {
                let link = target.skillsDirectory.appending(path: name)
                guard isUnmarkLink(link) else { continue }
                try fileManager.removeItem(at: link)
                removed.append(link)
            }
        }
        return removed
    }

    /// A symbolic link named `unmark-…` whose destination is that same name in some Unmark.app's skills folder. Judged
    /// by the destination's text, not where it resolves, so a link left dangling by a moved app still counts.
    private static func isUnmarkLink(_ url: URL) -> Bool {
        let name = url.lastPathComponent
        guard name.hasPrefix(linkNamePrefix),
            let destination = try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)
        else { return false }
        return destination.hasSuffix("/\(bundleRelativeSkillsPath)/\(name)")
    }
}
