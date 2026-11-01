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

    public init?(body: Any) {
        guard let body = body as? [String: Any] else { return nil }
        switch body["type"] as? String {
        case "previewScrolled":
            guard let line = body["line"] as? Double, line.isFinite else { return nil }
            self = .previewScrolled(line: line)
        case "taskToggled":
            guard let line = body["line"] as? Int, line >= 0, let checked = body["checked"] as? Bool else { return nil }
            self = .taskToggled(line: line, checked: checked)
        default:
            return nil
        }
    }
}
