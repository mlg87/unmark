import SwiftUI
import UnmarkCore

/// Settings' Agent Skills section (#238): links Unmark's documentation skills into the folders coding agents read, with
/// one status for every skill and every agent at once (epic #229). Both folders are in the user's home, so unlike the
/// Command-Line Tool section it needs no administrator prompt.
struct AgentSkillsSection: View {
    private static let skillsDirectory = Bundle.main.bundleURL.appending(path: SkillInstall.bundleRelativeSkillsPath)
    private static let skills = SkillInstall.bundledSkills(in: skillsDirectory)
    private static let home = FileManager.default.homeDirectoryForCurrentUser

    @Environment(\.controlActiveState) private var controlActiveState
    @State private var targets = SkillInstall.targets(home: Self.home)
    @State private var status = SkillInstall.status(skills: Self.skills, targets: SkillInstall.targets(home: Self.home))
    /// The last install's conflicts, each kept until a status read finds that something else no longer has its name.
    @State private var conflicts: [URL] = []
    @State private var failure: Failure?

    var body: some View {
        Section("Agent Skills") {
            LabeledContent {
                HStack {
                    if status != .installed {
                        Button(status == .notInstalled ? "Install Skills" : "Reinstall", action: install)
                    }
                    if status != .notInstalled {
                        Button("Remove", action: uninstall)
                    }
                }
            } label: {
                switch status {
                case .installed:
                    Text("Installed in \(installedFolders)")
                case .partlyInstalled:
                    Text("Partly installed")
                case .notInstalled:
                    Text("Not installed")
                }
                Text(
                    """
                    Skills that teach coding agents to write documentation, for Claude Code, Codex, Gemini CLI, \
                    Qwen Code, and others.
                    """)
                ForEach(conflicts, id: \.self) { link in
                    Text(
                        """
                        Skipped \(link.lastPathComponent) in \(Self.displayPath(link.deletingLastPathComponent())): \
                        another skill has that name.
                        """)
                }
            }
        }
        .alert(
            failure?.title ?? "",
            isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } }),
            presenting: failure
        ) { _ in
            Button("OK") {}
        } message: { failure in
            Text(verbatim: failure.message)
        }
        .onAppear(perform: readStatus)
        // Links can change outside Unmark, e.g. from `unmark skills` in Terminal (#237) or by moving the app.
        .onChange(of: controlActiveState) { _, state in
            if state == .key {
                readStatus()
            }
        }
    }

    /// `~/.agents/skills and ~/.claude/skills`, or one folder when Claude Code's isn't there.
    private var installedFolders: String {
        targets.map { Self.displayPath($0.skillsDirectory) }.joined(separator: " and ")
    }

    private func readStatus() {
        targets = SkillInstall.targets(home: Self.home)
        status = SkillInstall.status(skills: Self.skills, targets: targets)
        conflicts = conflicts.filter { link in
            let skill = Self.skillsDirectory.appending(path: link.lastPathComponent)
            let target = SkillInstall.Target(skillsDirectory: link.deletingLastPathComponent())
            return SkillInstall.linkState(of: skill, in: target) == .conflict
        }
    }

    private func install() {
        do {
            conflicts = try SkillInstall.install(skills: Self.skills, into: SkillInstall.targets(home: Self.home))
                .conflicts
        } catch {
            failure = Failure(title: "Couldn’t install the skills", error: error)
        }
        readStatus()
    }

    private func uninstall() {
        do {
            _ = try SkillInstall.uninstall(from: SkillInstall.targets(home: Self.home))
        } catch {
            failure = Failure(title: "Couldn’t remove the skills", error: error)
        }
        readStatus()
    }

    /// `~/.agents/skills` rather than the full path, as agents' own docs name the folder.
    private static func displayPath(_ url: URL) -> String {
        let homePath = home.path
        guard url.path.hasPrefix(homePath + "/") else { return url.path }
        return "~" + url.path.dropFirst(homePath.count)
    }

    private struct Failure {
        let title: LocalizedStringKey
        let message: String

        init(title: LocalizedStringKey, error: any Error) {
            self.title = title
            message = error.localizedDescription
        }
    }
}
