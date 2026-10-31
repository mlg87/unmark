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

/// Each notice is distinct, so a second click on the same broken link restarts the notice's timer.
struct MissingLinkTarget: Equatable {
    let fileName: String
    private let id = UUID()

    init(fileName: String) {
        self.fileName = fileName
    }
}
