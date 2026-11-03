import SwiftUI
import UnmarkCore

/// The Outline: the document's headings in order, indented by level, with the current heading's row selected
/// (unmark-1793451438713-29-a6ce6672, q51). Choosing a row scrolls the Preview to its heading.
struct OutlineView: View {
    /// H1 rows are flush; each level below indents by this much more.
    private static let indentPerLevel: CGFloat = 12

    let headings: [OutlineHeading]
    let currentHeadingID: String?
    let headingChosen: @MainActor (String) -> Void

    var body: some View {
        if headings.isEmpty {
            Text("No Headings")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List(selection: selection) {
                ForEach(headings) { heading in
                    Text(heading.text)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.leading, CGFloat(heading.level - 1) * Self.indentPerLevel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                        // A click on the row that's already selected doesn't change the selection, but the reader
                        // may have scrolled since its heading passed the top, so clicks scroll on their own.
                        .onTapGesture { headingChosen(heading.id) }
                }
            }
            .listStyle(.sidebar)
        }
    }

    /// The Preview's scroll position drives the selection. Selecting a row with the arrow keys, or by a click in its
    /// inset outside the tap area, scrolls like a click on its text.
    private var selection: Binding<String?> {
        Binding(
            get: { currentHeadingID },
            set: { id in
                if let id, id != currentHeadingID {
                    headingChosen(id)
                }
            })
    }
}

/// Whether windows show the Outline: one flag for every window and both modes, remembered across launches (q34). The
/// Outline starts hidden.
enum OutlineVisibility {
    static let key = "outlineVisible"
}
