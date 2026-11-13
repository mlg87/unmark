import Sparkle
import SwiftUI
import UnmarkCore

/// Settings' General form (epic #9). It writes the defaults every document window reads through `@AppStorage`, so open
/// Source panes follow each change as it's made, and zooming the Source shows here as its new size (q43).
struct GeneralSettingsView: View {
    private static let width: CGFloat = 480

    let updater: SPUUpdater

    @AppStorage(SourceFont.familyKey) private var sourceFontFamily = SourceFont.defaultFamily
    @AppStorage(SourceFont.sizeKey) private var sourceFontSize = SourceFont.defaultSize
    /// Listed once, when Settings first opens.
    @State private var monospacedFamilies = SourceFont.installedMonospacedFamilies()

    var body: some View {
        Form {
            Section("Source") {
                Picker("Font", selection: fontFamily) {
                    ForEach(monospacedFamilies, id: \.self) { family in
                        Text(verbatim: family).tag(family)
                    }
                }
                LabeledContent("Size") {
                    HStack(spacing: 4) {
                        TextField("Size", value: fontSize, format: .number)
                            .labelsHidden()
                            .multilineTextAlignment(.trailing)
                            .frame(width: 44)
                        Stepper("Size", value: fontSize, in: SourceFont.sizeRange, step: 1)
                            .labelsHidden()
                        Text("pt")
                    }
                }
            }
            DefaultMarkdownAppSection()
            CommandLineToolSection()
            UpdatesSection(updater: updater)
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
        .frame(width: Self.width)
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Shows SF Mono, which the Source falls back to, while the chosen family isn't installed.
    private var fontFamily: Binding<String> {
        Binding(
            get: { monospacedFamilies.contains(sourceFontFamily) ? sourceFontFamily : SourceFont.defaultFamily },
            set: { sourceFontFamily = $0 })
    }

    /// A size typed outside the range becomes the nearest size in it.
    private var fontSize: Binding<Double> {
        Binding(get: { sourceFontSize }, set: { sourceFontSize = SourceFont.clamped($0) })
    }
}
