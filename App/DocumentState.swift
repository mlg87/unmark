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

    /// Where the document's relative images and links resolve; see `PreviewURL.documentBaseURL(forDocumentAt:)`.
    /// Without a file, relative paths resolve inside the renderer bundle and match nothing.
    var documentBaseURL: URL {
        fileURL.map(PreviewURL.documentBaseURL(forDocumentAt:)) ?? PreviewURL.rendererPage
    }
}
