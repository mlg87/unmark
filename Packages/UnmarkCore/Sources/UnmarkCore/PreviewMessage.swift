import Foundation

/// What the Preview's renderer posts to the app through `window.webkit.messageHandlers.unmark`
/// (unmark-1793451437275-26-1e1952b0). Bodies arrive as WebKit's conversion of a JavaScript value, so they're
/// parsed without assuming their shape.
public enum PreviewMessage: Equatable, Sendable {
    /// The name the renderer's script message handler is registered under.
    public static let handlerName = "unmark"

    /// The user scrolled the Preview; `line` is the 0-based source line at its top, fractional between blocks.
    case previewScrolled(line: Double)
    /// The user clicked the checkbox of the task-list item on 0-based source `line`, asking for it to be `checked`
    /// (unmark-1793451438253-28-4df62a6e). The page leaves the checkbox as it was until the edited text renders.
    case taskToggled(line: Int, checked: Bool)
    /// The current heading changed: the last heading at or above the Preview's top, or nil above the first one
    /// (unmark-1793451438713-29-a6ce6672). The Outline selects its row.
    case currentHeading(id: String?)
    /// A render finished parsing and showing the whole document; `headings` is its outline in document order.
    case outline(headings: [OutlineHeading])

    public init?(body: Any) {
        guard let body = body as? [String: Any] else { return nil }
        switch body["type"] as? String {
        case "previewScrolled":
            guard let line = body["line"] as? Double, line.isFinite else { return nil }
            self = .previewScrolled(line: line)
        case "taskToggled":
            guard let line = body["line"] as? Int, line >= 0, let checked = body["checked"] as? Bool else { return nil }
            self = .taskToggled(line: line, checked: checked)
        case "currentHeading":
            // WebKit hands JavaScript's null over as NSNull.
            guard let id = body["id"], id is String || id is NSNull else { return nil }
            self = .currentHeading(id: id as? String)
        case "outline":
            guard let headings = OutlineHeading.outline(body: body["headings"]) else { return nil }
            self = .outline(headings: headings)
        default:
            return nil
        }
    }
}
