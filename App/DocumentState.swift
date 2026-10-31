import Foundation
import Observation
import UnmarkCore

/// What a document window shows. `MarkdownDocument` updates it when the file changes, moves, or is deleted on disk
/// (#24), and the window's SwiftUI content observes it.
@MainActor
@Observable
final class DocumentState {
    var text = ""
    /// Set from `presentedItemDidMove(to:)` as well as on open, because the document's `fileURL` follows a move only
    /// some time after that callback.
    var fileURL: URL?
    /// The file was deleted while open. The window keeps showing the last content.
    var fileWasDeleted = false
    /// The element the Preview should scroll to next, from a link click (#23).
    var scrollRequest: ScrollRequest?
    /// A clicked link named a file that doesn't exist (#23). The window shows it briefly.
    var missingLinkTarget: MissingLinkTarget?
    /// File → Print… or Export as PDF… was chosen; the Preview prints itself next (#34).
    var printRequest: PrintRequest?
    /// Split mode shows the Source beside the Preview. Per window and never saved, so every window opens in Preview
    /// mode (q15).
    var isSourceVisible = false

    /// Where the document's relative images and links resolve; see `PreviewURL.documentBaseURL(forDocumentAt:)`.
    /// Without a file, relative paths resolve inside the renderer bundle and match nothing.
    var documentBaseURL: URL {
        fileURL.map(PreviewURL.documentBaseURL(forDocumentAt:)) ?? PreviewURL.rendererPage
    }
}

/// Each request is distinct, so clicking the same anchor again scrolls back to it.
struct ScrollRequest: Equatable {
    let elementID: String
    private let id = UUID()

    init(elementID: String) {
        self.elementID = elementID
    }
}

/// Each request is distinct, so choosing Print… or Export as PDF… again prints again.
struct PrintRequest: Equatable {
    /// Export as PDF… runs the same print operation as Print…, so its PDF is paginated identically (q54).
    enum Destination: Equatable {
        /// The print panel, where the user picks a printer.
        case printPanel
        /// A PDF file at this URL, written without a print panel.
        case pdf(URL)
    }

    let destination: Destination
    private let id = UUID()

    init(destination: Destination) {
        self.destination = destination
    }
}

/// Each notice is distinct, so a second click on the same broken link restarts the notice's timer.
struct MissingLinkTarget: Equatable {
    let fileName: String
    private let id = UUID()

    init(fileName: String) {
        self.fileName = fileName
    }
}
